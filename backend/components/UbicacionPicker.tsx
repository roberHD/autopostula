"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronDown, Check } from "lucide-react";

// docs/revision-2026-09-16.md §2.1: la ubicación se declara con opciones
// cerradas (región + comuna, de /api/regiones-comunas), nunca texto libre --
// mismo componente en el onboarding (paso "¿Qué buscas?") y en
// /dashboard/filtros, para que editarla después sea literalmente lo mismo
// que declararla la primera vez.

export type UbicacionValor = {
  regiones: string[];
  comunas: string[];
  todaLaRegion: boolean;
  aceptaRemoto: boolean;
};

export function ubicacionVacia(): UbicacionValor {
  return { regiones: [], comunas: [], todaLaRegion: false, aceptaRemoto: false };
}

type Region = { codigo: string; nombre: string };
type Comuna = { nombre: string; region: string };

export default function UbicacionPicker({
  valor,
  onChange,
}: {
  valor: UbicacionValor;
  onChange: (v: UbicacionValor) => void;
}) {
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busquedaComuna, setBusquedaComuna] = useState("");
  // La lista arrancaba siempre desplegada y no habia forma de cerrarla: 170px
  // de comunas empujando el resto del paso, incluido el boton de continuar.
  const [listaAbierta, setListaAbierta] = useState(false);
  const cajaComunasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/regiones-comunas")
      .then((r) => r.json())
      .then((data) => {
        setRegiones(data.regiones ?? []);
        setComunas(data.comunas ?? []);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  // Cerrar con Escape y al hacer clic fuera: es lo que ya espera cualquiera
  // de un desplegable, mas alla del boton explicito.
  useEffect(() => {
    if (!listaAbierta) return;

    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setListaAbierta(false);
      }
    }
    function alClicar(e: MouseEvent) {
      if (!cajaComunasRef.current?.contains(e.target as Node)) setListaAbierta(false);
    }

    document.addEventListener("keydown", alTeclear, true);
    document.addEventListener("mousedown", alClicar);
    return () => {
      document.removeEventListener("keydown", alTeclear, true);
      document.removeEventListener("mousedown", alClicar);
    };
  }, [listaAbierta]);

  function alternarRegion(codigo: string) {
    const yaEsta = valor.regiones.includes(codigo);
    const nuevasRegiones = yaEsta ? valor.regiones.filter((r) => r !== codigo) : [...valor.regiones, codigo];
    // Al sacar una región, se sacan también las comunas elegidas que eran de ella.
    const nuevasComunas = yaEsta
      ? valor.comunas.filter((c) => {
          const com = comunas.find((cc) => cc.nombre.toLowerCase() === c.toLowerCase());
          return !com || com.region !== codigo;
        })
      : valor.comunas;
    onChange({ ...valor, regiones: nuevasRegiones, comunas: nuevasComunas });
  }

  function alternarComuna(nombre: string) {
    const nombreN = nombre.toLowerCase();
    const yaEsta = valor.comunas.some((c) => c.toLowerCase() === nombreN);
    onChange({
      ...valor,
      comunas: yaEsta ? valor.comunas.filter((c) => c.toLowerCase() !== nombreN) : [...valor.comunas, nombre],
    });
  }

  const comunasDeLasRegiones = comunas.filter((c) => valor.regiones.includes(c.region));
  const comunasFiltradas = busquedaComuna.trim()
    ? comunasDeLasRegiones.filter((c) => c.nombre.toLowerCase().includes(busquedaComuna.trim().toLowerCase()))
    : comunasDeLasRegiones;

  if (cargando) {
    return <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Cargando comunas...</p>;
  }

  return (
    <div>
      <label className="ap-label">Región (una o más)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {regiones.map((r) => {
          const activo = valor.regiones.includes(r.codigo);
          return (
            <button
              key={r.codigo}
              type="button"
              aria-pressed={activo}
              onClick={() => alternarRegion(r.codigo)}
              className="ap-etiqueta"
              style={{
                cursor: "pointer",
                background: activo ? "var(--accent)" : undefined,
                color: activo ? "var(--accent-contrast)" : undefined,
                borderColor: activo ? "var(--accent)" : undefined,
              }}
            >
              {r.nombre}
            </button>
          );
        })}
      </div>

      {valor.regiones.length > 0 && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={valor.todaLaRegion}
              onChange={(e) => onChange({ ...valor, todaLaRegion: e.target.checked })}
            />
            <span style={{ fontSize: 13 }}>
              {valor.regiones.length > 1 ? "Toda esa región/regiones" : "Toda la región"} (no elijo comunas específicas)
            </span>
          </label>

          {!valor.todaLaRegion && (
            <div style={{ marginBottom: 14 }}>
              <label className="ap-label">Comunas</label>
              {valor.comunas.length > 0 && (
                <div className="ap-etiquetas" style={{ marginBottom: 8 }}>
                  {valor.comunas.map((c) => (
                    <span key={c} className="ap-etiqueta">
                      {c}
                      <button
                        type="button"
                        className="ap-etiqueta__x"
                        onClick={() => alternarComuna(c)}
                        aria-label={`Quitar ${c}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div ref={cajaComunasRef} style={{ position: "relative" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="ap-input"
                    placeholder="Buscar comuna…"
                    value={busquedaComuna}
                    onChange={(e) => {
                      setBusquedaComuna(e.target.value);
                      setListaAbierta(true); // escribir siempre muestra los resultados
                    }}
                    onFocus={() => setListaAbierta(true)}
                  />
                  <button
                    type="button"
                    className="ap-comunas__toggle"
                    onClick={() => setListaAbierta((a) => !a)}
                    aria-expanded={listaAbierta}
                    aria-label={listaAbierta ? "Cerrar la lista de comunas" : "Ver la lista de comunas"}
                    title={listaAbierta ? "Cerrar" : "Ver comunas"}
                  >
                    {listaAbierta ? <X size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>

                {listaAbierta && (
                <div
                  style={{
                    maxHeight: 170,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: 4,
                    marginTop: 8,
                    background: "var(--bg-elevated)",
                  }}
                >
                {comunasFiltradas.slice(0, 80).map((c) => {
                  const elegida = valor.comunas.some((v) => v.toLowerCase() === c.nombre.toLowerCase());
                  return (
                    <button
                      key={c.nombre}
                      type="button"
                      onClick={() => alternarComuna(c.nombre)}
                      className="ap-button-ghost"
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "7px 9px",
                        fontSize: 12.5,
                        border: "none",
                        background: elegida ? "var(--bg-elevated-2)" : undefined,
                        fontWeight: elegida ? 700 : undefined,
                      }}
                    >
                      {elegida && <Check size={12} style={{ marginRight: 5, verticalAlign: "-1px" }} />}
                      {c.nombre}
                    </button>
                  );
                })}
                {comunasFiltradas.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", padding: 7 }}>Sin resultados</p>
                )}
                </div>
                )}

                {listaAbierta && (
                  <button
                    type="button"
                    className="ap-comunas__listo"
                    onClick={() => setListaAbierta(false)}
                  >
                    Listo{valor.comunas.length > 0 ? ` — ${valor.comunas.length} elegida${valor.comunas.length > 1 ? "s" : ""}` : ""}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={valor.aceptaRemoto}
          onChange={(e) => onChange({ ...valor, aceptaRemoto: e.target.checked })}
        />
        <span style={{ fontSize: 13 }}>También acepto trabajo remoto, de cualquier ubicación</span>
      </label>
    </div>
  );
}
