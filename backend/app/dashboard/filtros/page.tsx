"use client";

import { useEffect, useState } from "react";
import { X, FlaskConical, Target, Plus, MapPin, Compass, Gauge } from "lucide-react";
import UbicacionPicker, { ubicacionVacia, type UbicacionValor } from "@/components/UbicacionPicker";

type PerfilCompilado = {
  version: number;
  roles: { canonico: string; sinonimos: string[]; peso: number }[];
  vetos: { patron: string | null; razon: string }[];
  senales: { patron: string; delta: number }[];
};

type ObjetivoItem = { ciuo: string | null; etiqueta: string; peso: number };

// docs/revision-scorer-2026-09-30.md §7: el umbral ajustado con las decisiones
// de la persona (lib/calibracion-umbral.ts). Los números se repiten acá por la
// misma razón que Amplitud: es una página de cliente.
type Calibracion = { calibrarUmbral: boolean; umbralPostularCalibrado: number | null };
const UMBRAL_NORMAL = 65;

// docs/amplitud-de-busqueda.md §4 y §7. El tipo se repite acá en vez de
// importarlo de lib/amplitud.ts porque ese módulo toca la base de datos y esta
// es una página de cliente.
type Amplitud = "solo" | "parecidos" | "rubro" | "abierto";

const OPCIONES_AMPLITUD: { valor: Amplitud; titulo: string; detalle: string }[] = [
  { valor: "solo", titulo: "Solo lo que puse arriba", detalle: "Esos cargos y sus sinónimos, nada más." },
  {
    valor: "parecidos",
    titulo: "Eso y trabajos parecidos",
    detalle:
      "Suma los oficios del mismo grupo — por ejemplo, si buscas asistente de ventas, también vendedor de farmacia o de local comercial. Aparecen en Por decidir, no se postulan solos.",
  },
  {
    valor: "rubro",
    titulo: "Cualquier cosa de mi rubro",
    detalle: "Suma el rubro completo. Vas a ver bastante más en Por decidir, y lo decides tú.",
  },
  {
    valor: "abierto",
    titulo: "Cualquier trabajo que pueda hacer",
    detalle:
      "Deja de mirar el cargo: filtra por comuna, jornada, lo que descartaste, y no postula a lo que pide un título o una licencia que tu CV no tiene.",
  },
];

export default function FiltrosPage() {
  const [cargando, setCargando] = useState(true);

  const [perfilCompilado, setPerfilCompilado] = useState<PerfilCompilado | null>(null);
  const [compilando, setCompilando] = useState(false);
  const [mensajeScorer, setMensajeScorer] = useState("");

  // Objetivo laboral (docs/objetivo-laboral.md) -- distinto de cargoObjetivo
  // del CV: esto es lo que la persona declara que busca, no lo que la IA
  // infirió de su historial. Guardarlo dispara la recompilación del perfil.
  const [objetivos, setObjetivos] = useState<ObjetivoItem[]>([]);
  const [sugerenciaCv, setSugerenciaCv] = useState<string | null>(null);
  const [objetivoConfirmado, setObjetivoConfirmado] = useState(false);
  const [guardandoObjetivo, setGuardandoObjetivo] = useState(false);
  const [mensajeObjetivo, setMensajeObjetivo] = useState("");
  const [sugerirRetriaje, setSugerirRetriaje] = useState(false);

  // §2.1 (docs/revision-2026-09-16.md): mismo picker que el onboarding, para
  // que corregir la ubicación después sea tan fácil como declararla la
  // primera vez.
  // docs/amplitud-de-busqueda.md §4: qué tan lejos del objetivo acepta buscar.
  const [amplitud, setAmplitud] = useState<Amplitud>("parecidos");
  const [mensajeAmplitud, setMensajeAmplitud] = useState("");

  const [ubicacion, setUbicacion] = useState<UbicacionValor>(ubicacionVacia());
  const [guardandoUbicacion, setGuardandoUbicacion] = useState(false);
  const [mensajeUbicacion, setMensajeUbicacion] = useState("");

  const [calibracion, setCalibracion] = useState<Calibracion>({ calibrarUmbral: true, umbralPostularCalibrado: null });
  const [mensajeCalibracion, setMensajeCalibracion] = useState("");

  useEffect(() => {
    async function cargar() {
      try {
        const [resPerfil, resObjetivos, resPrefs] = await Promise.all([
          fetch("/api/ai/compilar-perfil"),
          fetch("/api/objetivos"),
          fetch("/api/preferencias-busqueda"),
        ]);

        if (resPerfil.ok) {
          const perfilData = await resPerfil.json();
          setPerfilCompilado(perfilData.perfilCompilado ?? null);
        }

        if (resPrefs.ok) {
          const prefsData = await resPrefs.json();
          if (prefsData?.ubicacionDeclarada) setUbicacion({ ...ubicacionVacia(), ...prefsData.ubicacionDeclarada });
          if (prefsData?.amplitud) setAmplitud(prefsData.amplitud as Amplitud);
          if (prefsData) {
            setCalibracion({
              calibrarUmbral: prefsData.calibrarUmbral !== false,
              umbralPostularCalibrado: prefsData.umbralPostularCalibrado ?? null,
            });
          }
        }

        if (resObjetivos.ok) {
          const objData = await resObjetivos.json();
          setObjetivoConfirmado(!!objData.objetivoConfirmado);
          setSugerenciaCv(objData.sugerenciaCv ?? null);
          if (Array.isArray(objData.objetivos) && objData.objetivos.length) {
            setObjetivos(objData.objetivos.map((o: any) => ({ ciuo: o.ciuo ?? null, etiqueta: o.etiqueta, peso: o.peso })));
          } else if (objData.sugerenciaCv) {
            // Precarga la sugerencia del CV como punto de partida editable --
            // todavía no está confirmada hasta que se guarde.
            setObjetivos([{ ciuo: null, etiqueta: objData.sugerenciaCv, peso: 1.0 }]);
          } else {
            setObjetivos([{ ciuo: null, etiqueta: "", peso: 1.0 }]);
          }
        }
      } catch (err) {
        console.error("Error cargando filtros:", err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  async function compilarPerfil() {
    setCompilando(true);
    setMensajeScorer("");
    try {
      const res = await fetch("/api/ai/compilar-perfil", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setMensajeScorer(data.error ?? "No se pudo actualizar tu búsqueda"); return; }
      setPerfilCompilado(data.perfilCompilado);
      setMensajeScorer("Búsqueda actualizada.");
    } catch (err) {
      console.error("Error compilando perfil:", err);
      setMensajeScorer("No se pudo actualizar tu búsqueda — revisa la consola");
    } finally {
      setCompilando(false);
    }
  }

  // §4: cambiar la amplitud NO recompila el perfil -- la expansión es una
  // consulta al catálogo que se resuelve al servirle el perfil a la extensión.
  // Por eso se guarda al tocar la opción, sin botón aparte.
  async function guardarAmplitud(valor: Amplitud) {
    const anterior = amplitud;
    setAmplitud(valor);
    setMensajeAmplitud("");
    try {
      const res = await fetch("/api/preferencias-busqueda", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amplitud: valor }),
      });
      if (!res.ok) {
        setAmplitud(anterior);
        setMensajeAmplitud("No se pudo guardar");
        return;
      }
      setMensajeAmplitud("Guardado. La extensión lo usa desde su próxima revisión.");
    } catch (err) {
      console.error("Error guardando amplitud:", err);
      setAmplitud(anterior);
      setMensajeAmplitud("No se pudo guardar — revisa la consola");
    }
  }

  // §7: apagarlo vuelve al umbral normal; prenderlo lo recalcula en la próxima
  // revisión de la extensión. Como la amplitud, se guarda al tocarlo.
  async function guardarCalibracion(valor: boolean) {
    const anterior = calibracion;
    setCalibracion({ ...calibracion, calibrarUmbral: valor });
    setMensajeCalibracion("");
    try {
      const res = await fetch("/api/preferencias-busqueda", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibrarUmbral: valor }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setCalibracion(anterior);
        setMensajeCalibracion("No se pudo guardar");
        return;
      }
      setCalibracion({ calibrarUmbral: data.calibrarUmbral !== false, umbralPostularCalibrado: data.umbralPostularCalibrado ?? null });
      setMensajeCalibracion("Guardado. La extensión lo usa desde su próxima revisión.");
    } catch (err) {
      console.error("Error guardando el ajuste del umbral:", err);
      setCalibracion(anterior);
      setMensajeCalibracion("No se pudo guardar — revisa la consola");
    }
  }

  async function guardarUbicacion() {
    setGuardandoUbicacion(true);
    setMensajeUbicacion("");
    try {
      const res = await fetch("/api/preferencias-busqueda", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ubicacionDeclarada: ubicacion }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMensajeUbicacion(data.error ?? "No se pudo guardar"); return; }
      setMensajeUbicacion("Guardado. La extensión la usa desde su próxima revisión.");
    } catch (err) {
      console.error("Error guardando ubicación:", err);
      setMensajeUbicacion("No se pudo guardar — revisa la consola");
    } finally {
      setGuardandoUbicacion(false);
    }
  }

  async function guardarObjetivos() {
    const limpios = objetivos.map((o) => ({ ...o, etiqueta: o.etiqueta.trim() })).filter((o) => o.etiqueta);
    if (!limpios.length) { setMensajeObjetivo("Escribe al menos un objetivo."); return; }

    setGuardandoObjetivo(true);
    setMensajeObjetivo("");
    setSugerirRetriaje(false);
    try {
      const res = await fetch("/api/objetivos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivos: limpios }),
      });
      const data = await res.json();
      if (!res.ok) { setMensajeObjetivo(data.error ?? "No se pudo guardar"); return; }

      setObjetivoConfirmado(true);
      setObjetivos(limpios);
      if (data.perfilCompilado) setPerfilCompilado(data.perfilCompilado);
      setSugerirRetriaje(!!data.sugerirRetriaje);
      setMensajeObjetivo(
        data.avisoCompilacion
          ? "Objetivo guardado. " + data.avisoCompilacion
          : "Objetivo guardado y búsqueda actualizada."
      );
    } catch (err) {
      console.error("Error guardando objetivo:", err);
      setMensajeObjetivo("No se pudo guardar — revisa la consola");
    } finally {
      setGuardandoObjetivo(false);
    }
  }

  if (cargando) return <div className="ap-empty">Cargando...</div>;

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Filtros de búsqueda</h1>
        <p className="ap-page-sub">
          Define qué ofertas quieres que la extensión postule por ti — se aplica tanto al escaneo manual como a la búsqueda automática.
        </p>
      </div>

      <div className="ap-hoja" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="ap-section ap-animate-in" style={{ marginBottom: 0, borderColor: "color-mix(in oklch, var(--chart-3) 35%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Target size={15} color="var(--chart-3)" />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>Objetivo laboral</p>
        </div>
        <p className="ap-section-sub">
          Tu CV describe de dónde vienes. Esto es a dónde vas — puede ser distinto, sobre todo si te
          estás cambiando de rubro. El motor de búsqueda usa esto (no tu CV) para decidir qué
          ofertas te calzan.
        </p>

        {!objetivoConfirmado && sugerenciaCv && (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
            Por tu CV, parece que buscas <strong>{sugerenciaCv}</strong> — puedes dejarlo así o cambiarlo abajo.
          </p>
        )}

        {mensajeObjetivo && (
          <p style={{ fontSize: 12.5, color: mensajeObjetivo.startsWith("Objetivo guardado") ? "var(--status-finalizado)" : "var(--status-rechazado)", marginBottom: 10 }}>
            {mensajeObjetivo}
          </p>
        )}

        {sugerirRetriaje && (
          <div className="nota" style={{ marginBottom: 12 }}>
            <p style={{ margin: 0 }}>
              Cambiaste de rubro. Vale la pena rehacer el triaje de onboarding para recalibrar qué
              ofertas te mostramos — desde tu perfil puedes volver a hacerlo cuando quieras.
            </p>
          </div>
        )}

        {objetivos.map((o, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input
              className="ap-input"
              style={{ flex: 1 }}
              value={o.etiqueta}
              placeholder={i === 0 ? "Ej: vendedor" : "Ej: desarrollador de software (segundo objetivo)"}
              onChange={(e) => {
                const copia = [...objetivos];
                copia[i] = { ...copia[i], etiqueta: e.target.value };
                setObjetivos(copia);
              }}
            />
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              className="ap-input"
              style={{ width: 72 }}
              title="Peso: 1.0 = objetivo principal, menos si lo aceptarías pero no lo buscas activamente"
              value={o.peso}
              onChange={(e) => {
                const copia = [...objetivos];
                copia[i] = { ...copia[i], peso: Math.max(0, Math.min(1, Number(e.target.value))) };
                setObjetivos(copia);
              }}
            />
            {objetivos.length > 1 && (
              <button
                type="button"
                onClick={() => setObjetivos(objetivos.filter((_, j) => j !== i))}
                style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
                aria-label="Quitar objetivo"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {objetivos.length < 4 && (
            <button
              type="button"
              className="ap-button-ghost"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => setObjetivos([...objetivos, { ciuo: null, etiqueta: "", peso: 0.5 }])}
            >
              <Plus size={14} /> Agregar otro objetivo
            </button>
          )}
          <button className="ap-button" disabled={guardandoObjetivo} onClick={guardarObjetivos}>
            {guardandoObjetivo ? "Guardando..." : "Guardar objetivo"}
          </button>
        </div>
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.06s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Compass size={15} />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>¿Qué tan abierto estás?</p>
        </div>
        <p className="ap-section-sub">
          No todo el mundo busca un cargo exacto. Acá decides si AutoPostula mira solo lo que pusiste
          arriba, o también lo que se le parece.
        </p>

        {mensajeAmplitud && (
          <p style={{ fontSize: 12.5, color: mensajeAmplitud.startsWith("Guardado") ? "var(--status-finalizado)" : "var(--status-rechazado)", marginBottom: 10 }}>
            {mensajeAmplitud}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {OPCIONES_AMPLITUD.map((opcion) => {
            const elegida = amplitud === opcion.valor;
            return (
              <label
                key={opcion.valor}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  border: elegida
                    ? "1px solid color-mix(in oklch, var(--chart-2) 55%, transparent)"
                    : "1px solid var(--border)",
                  background: elegida ? "color-mix(in oklch, var(--chart-2) 8%, transparent)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="amplitud"
                  checked={elegida}
                  onChange={() => guardarAmplitud(opcion.valor)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {opcion.titulo}
                    {opcion.valor === "parecidos" && (
                      <span style={{ fontSize: 11.5, fontWeight: 400, opacity: 0.7 }}> · recomendado</span>
                    )}
                  </span>
                  <span style={{ display: "block", fontSize: 12.5, opacity: 0.75, marginTop: 2 }}>{opcion.detalle}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.08s", borderColor: "color-mix(in oklch, var(--chart-4, var(--chart-2)) 35%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <MapPin size={15} />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>Ubicación</p>
        </div>
        <p className="ap-section-sub">
          Dónde estás dispuesto a trabajar. Lo decides tú, no lo adivinamos de tu CV: así no se
          cuela una comuna que quieres evitar ni se queda afuera una que sí te sirve.
        </p>

        {mensajeUbicacion && (
          <p style={{ fontSize: 12.5, color: mensajeUbicacion.startsWith("Guardado") ? "var(--status-finalizado)" : "var(--status-rechazado)", marginBottom: 10 }}>
            {mensajeUbicacion}
          </p>
        )}

        <UbicacionPicker valor={ubicacion} onChange={setUbicacion} />

        <div style={{ marginTop: 14 }}>
          <button className="ap-button-ghost" disabled={guardandoUbicacion} onClick={guardarUbicacion}>
            {guardandoUbicacion ? "Guardando..." : "Guardar ubicación"}
          </button>
        </div>
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.1s", borderColor: "color-mix(in oklch, var(--chart-2) 35%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <FlaskConical size={15} color="var(--chart-2)" />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>Perfil de búsqueda</p>
        </div>
        <p className="ap-section-sub">
          Es lo que la extensión usa para decidir a qué ofertas postular: los cargos que buscas, lo que
          descartas y dónde. Se arma con tu CV, tus objetivos y tus decisiones.
        </p>

        {mensajeScorer && (
          <p style={{ fontSize: 12.5, color: mensajeScorer.includes("actualizada") ? "var(--status-finalizado)" : "var(--status-rechazado)", marginBottom: 10 }}>
            {mensajeScorer}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: perfilCompilado ? 16 : 0, flexWrap: "wrap" }}>
          <button className="ap-button-ghost" onClick={compilarPerfil} disabled={compilando}>
            {compilando ? "Actualizando..." : perfilCompilado ? "Actualizar mi búsqueda" : "Armar mi búsqueda"}
          </button>
        </div>

        {perfilCompilado && (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Roles</p>
              {perfilCompilado.roles.map((r) => (
                <p key={r.canonico} style={{ fontSize: 12.5, marginBottom: 3 }}>
                  <strong>{r.canonico}</strong> ({Math.round(r.peso * 100)}%) — {r.sinonimos.join(", ")}
                </p>
              ))}
            </div>
            {perfilCompilado.vetos.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Vetos</p>
                {perfilCompilado.vetos.map((v, i) => (
                  <p key={v.patron ?? `sin-patron-${i}`} style={{ fontSize: 12.5, marginBottom: 3 }}>
                    {v.patron ? (
                      <>
                        <strong>{v.patron}</strong> — {v.razon}
                      </>
                    ) : (
                      // docs/amplitud-de-busqueda.md §2.2: "no quiero full time" no es un
                      // término que se pueda buscar -- se dice que no se está aplicando,
                      // en vez de fingir que sí filtra.
                      <span style={{ color: "var(--text-muted)" }}>
                        <strong>{v.razon}</strong> — esto no se está aplicando (no es un término buscable)
                      </span>
                    )}
                  </p>
                ))}
              </div>
            )}
            {perfilCompilado.senales.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Señales</p>
                {perfilCompilado.senales.map((s) => (
                  <p key={s.patron} style={{ fontSize: 12.5, marginBottom: 3 }}>
                    {s.delta >= 0 ? "+" : ""}{s.delta} por <strong>{s.patron}</strong>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.12s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Gauge size={15} />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>Cuándo postula sola</p>
        </div>
        <p className="ap-section-sub">
          Cada oferta recibe un puntaje según cuánto se parece a lo que buscas. Desde {UMBRAL_NORMAL} la
          extensión postula sola; entre 46 y {UMBRAL_NORMAL - 1} te la deja en Por decidir. Si casi siempre
          apruebas las más parecidas, el corte baja (hasta {UMBRAL_NORMAL - 10}) para no preguntarte lo que
          ya sabemos que dirías.
        </p>

        {mensajeCalibracion && (
          <p style={{ fontSize: 12.5, color: mensajeCalibracion.startsWith("Guardado") ? "var(--status-finalizado)" : "var(--status-rechazado)", marginBottom: 10 }}>
            {mensajeCalibracion}
          </p>
        )}

        <p style={{ fontSize: 13, marginBottom: 12 }}>
          {amplitud === "abierto" ? (
            <>
              Con «Cualquier trabajo que pueda hacer» no se ajusta: todo lo que cumple tus condiciones te lo
              preguntamos en Por decidir.
            </>
          ) : !calibracion.calibrarUmbral ? (
            <>Postula sola desde <strong>{UMBRAL_NORMAL}</strong>, siempre.</>
          ) : calibracion.umbralPostularCalibrado != null ? (
            <>
              Ahora postula sola desde <strong>{calibracion.umbralPostularCalibrado}</strong>: de las ofertas
              entre {calibracion.umbralPostularCalibrado} y {UMBRAL_NORMAL - 1} que te preguntamos, aprobaste
              casi todas. Si lo apagas, vuelve a {UMBRAL_NORMAL}.
            </>
          ) : (
            <>
              Por ahora postula sola desde <strong>{UMBRAL_NORMAL}</strong>. Lo revisamos una vez por semana
              con lo que decides en Por decidir, y solo lo bajamos si apruebas 9 de cada 10 de las más
              parecidas a lo que buscas.
            </>
          )}
        </p>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={calibracion.calibrarUmbral}
            onChange={(e) => guardarCalibracion(e.target.checked)}
          />
          Ajustarlo con mis decisiones en Por decidir
        </label>
      </div>
      </div>
    </div>
  );
}
