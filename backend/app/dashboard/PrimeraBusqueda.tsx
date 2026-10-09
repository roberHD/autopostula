"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, PlugZap } from "lucide-react";
import { URL_CHROME_WEB_STORE } from "@/lib/enlaces";
import { sinSoporteExtension } from "@/lib/dispositivo";
import { extensionPresente, pedirRecorrido } from "@/lib/puente-extension";
import { usarActivarPostulacion } from "@/lib/usar-activar-postulacion";
import { usarConectarExtension } from "@/lib/usar-conectar-extension";
import type { ModoAutomatico } from "@/lib/estado-automatico";
import {
  COOKIE_MISION_OCULTA,
  EVENTO_PANEL_CAMBIO,
  pasosPrimeraBusqueda,
  textoAlActivar,
  textoBusqueda,
  textoLoQueMiro,
  type ClavePaso,
  type EstadoPaso,
} from "@/lib/primera-busqueda";

export type Busqueda = { platformId: string; portal: string; url: string; conectado: boolean };

export type PrimeraVez = {
  yaMiro: boolean;
  descartadas: number;
  // A cuántas habría postulado al mirar un portal (extensión 2.17 en adelante;
  // null si todavía no llega ninguna).
  habriaPostulado?: number | null;
  objetivo: string | null;
  busquedas: Busqueda[];
};

// Se marcan al salir de la pestaña, y al volver se revisa qué pasó mientras
// tanto (sessionStorage: es de esta pestaña, y sobrevive al recargarla).
const FUE_A_INSTALAR = "ap_mision_fue_a_instalar";
const FUE_AL_PORTAL = "ap_mision_fue_al_portal";

function marcar(clave: string) {
  try {
    sessionStorage.setItem(clave, String(Date.now()));
  } catch {
    // Sin sessionStorage, la persona usa "Ya la instalé" o recarga a mano.
  }
}

// "2.17.0" >= [2, 17]. Sin versión (no está la extensión) es false.
function versionAlMenos(version: string | undefined, minima: [number, number]): boolean {
  const [mayor, menor] = (version || "").split(".").map((p) => Number(p) || 0);
  if (!version) return false;
  return mayor > minima[0] || (mayor === minima[0] && menor >= minima[1]);
}

function tomar(clave: string): boolean {
  try {
    const habia = sessionStorage.getItem(clave) !== null;
    sessionStorage.removeItem(clave);
    return habia;
  } catch {
    return false;
  }
}

/**
 * La tarjeta "Probemos" de Hoy (docs/primera-busqueda-guiada.md §10).
 *
 * Reemplaza al tablero en cero que veía una cuenta nueva: una sola misión, con
 * pasos que son la acción de verdad y se marcan solos. Instalar la extensión
 * (al volver de la tienda, la página se recarga sola para encontrarla),
 * conectarla con un clic, abrir el portal con su búsqueda armada para ver qué
 * haría con cada oferta -- sin enviar nada --, y recién ahí decidir.
 * Desaparece cuando la persona activa la postulación.
 */
export default function PrimeraBusqueda({
  correoVerificado,
  extensionConectada,
  primeraVez,
  porDecidir,
  habriaPostulado,
  modo,
  pruebaTotal,
  lugares,
  jornada,
  enMovilSegunServidor,
  refrescar,
  alConectar,
  alActivar,
  alOcultar,
}: {
  correoVerificado: boolean;
  extensionConectada: boolean;
  primeraVez: PrimeraVez;
  porDecidir: number;
  habriaPostulado: number | null;
  modo: ModoAutomatico | null;
  pruebaTotal: number;
  lugares: string[];
  jornada: string | null;
  enMovilSegunServidor: boolean | null;
  refrescar: () => Promise<void>;
  alConectar: () => void;
  alActivar: () => void;
  alOcultar: () => void;
}) {
  const [enMovil, setEnMovil] = useState(!!enMovilSegunServidor);
  // null = todavía revisando si la extensión está en este navegador.
  const [extensionAqui, setExtensionAqui] = useState<boolean | null>(null);
  // Volvió del portal y todavía no llega nada: se le dice qué esperar.
  const [esperandoPortal, setEsperandoPortal] = useState<"no" | "revisando" | "nada">("no");
  const [copiado, setCopiado] = useState(false);
  // La marca en cada oferta y la tarjeta del final son de la extensión 2.17
  // (docs/primera-busqueda-guiada.md §11); bridge.js deja su versión en el DOM.
  const [marcaCadaOferta, setMarcaCadaOferta] = useState(false);
  // Y desde la 2.19, el recorrido de cuatro pasos (§13).
  const [conRecorrido, setConRecorrido] = useState(false);
  const conexion = usarConectarExtension(alConectar);
  const activacion = usarActivarPostulacion(alActivar);

  useEffect(() => {
    setEnMovil(sinSoporteExtension());
    setMarcaCadaOferta(versionAlMenos(document.documentElement.dataset.autopostulaExtension, [2, 17]));
    setConRecorrido(versionAlMenos(document.documentElement.dataset.autopostulaExtension, [2, 19]));
    let vigente = true;
    extensionPresente().then((hay) => {
      if (vigente) setExtensionAqui(hay);
    });
    return () => {
      vigente = false;
    };
  }, []);

  // Lo más reciente, para leerlo desde el oyente de visibilidad sin volver a registrarlo.
  const ahora = useRef({ extensionAqui, yaMiro: primeraVez.yaMiro, refrescar });
  useEffect(() => {
    ahora.current = { extensionAqui, yaMiro: primeraVez.yaMiro, refrescar };
  });

  useEffect(() => {
    let reintento: ReturnType<typeof setTimeout> | null = null;
    async function alVolver() {
      if (document.visibilityState !== "visible") return;
      // Volvió de la tienda de Chrome. Las extensiones no se meten en las
      // pestañas que ya estaban abiertas: recargando, bridge.js la anuncia.
      if (tomar(FUE_A_INSTALAR) && !ahora.current.extensionAqui) {
        window.location.reload();
        return;
      }
      // Volvió del portal: ¿ya llegó lo que miró? La extensión manda los
      // descartes y las que deja para decidir apenas termina la página.
      if (tomar(FUE_AL_PORTAL) && !ahora.current.yaMiro) {
        setEsperandoPortal("revisando");
        await ahora.current.refrescar();
        if (reintento) clearTimeout(reintento);
        reintento = setTimeout(async () => {
          await ahora.current.refrescar();
          setEsperandoPortal("nada");
        }, 8000);
      }
    }
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      if (reintento) clearTimeout(reintento);
    };
  }, []);

  const conectada = extensionConectada || conexion.estado === "ok";
  const pasos = pasosPrimeraBusqueda({ enMovil, extensionAqui, extensionConectada: conectada, yaMiro: primeraVez.yaMiro });
  const estadoDe = (clave: ClavePaso): EstadoPaso => pasos.find((p) => p.clave === clave)?.estado ?? "despues";

  // Dónde buscar: los portales conectados; si no hay ninguno, los tres (al
  // elegir uno queda conectado). En el plan gratis se conecta uno a la vez.
  const conectados = primeraVez.busquedas.filter((b) => b.conectado);
  const opciones = conectados.length ? conectados : primeraVez.busquedas;
  const unSoloPortal = conectados.length === 1 ? conectados[0].portal : null;

  function irAlPortal(b: Busqueda) {
    marcar(FUE_AL_PORTAL);
    // docs/primera-busqueda-guiada.md §13: en esa búsqueda, la extensión muestra
    // el recorrido de la primera vez (si ya lo hizo, no lo repite).
    pedirRecorrido();
    setEsperandoPortal("no");
    if (!b.conectado) {
      // Queda conectado mientras se abre el portal (keepalive: aunque esta
      // pestaña pase a segundo plano, el pedido se termina).
      fetch("/api/platform-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId: b.platformId }),
        keepalive: true,
      })
        .then(() => window.dispatchEvent(new CustomEvent(EVENTO_PANEL_CAMBIO)))
        .catch(() => {});
    }
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/dashboard");
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin portapapeles: el enlace está escrito en el texto.
    }
  }

  function ocultar() {
    document.cookie = `${COOKIE_MISION_OCULTA}=1; path=/; max-age=31536000; samesite=lax`;
    alOcultar();
  }

  const busquedaEnPalabras = primeraVez.objetivo
    ? textoBusqueda({ objetivo: primeraVez.objetivo, lugares, jornada })
    : null;

  const paso = (clave: ClavePaso, n: number, titulo: string, detalle: React.ReactNode, acciones?: React.ReactNode) => {
    const estado = estadoDe(clave);
    return (
      <li className="ap-mision__paso" data-estado={estado} key={clave}>
        <span className="ap-mision__n" aria-hidden="true">{estado === "hecho" ? <Check size={15} strokeWidth={3} /> : n}</span>
        <div style={{ minWidth: 0 }}>
          <p className="ap-mision__pt">
            {titulo}
            {estado === "hecho" && <span className="ap-sr"> (listo)</span>}
          </p>
          {detalle && <div className="ap-mision__pd">{detalle}</div>}
          {estado === "ahora" && acciones && <div className="ap-mision__acc">{acciones}</div>}
        </div>
      </li>
    );
  };

  // ── Cada paso ─────────────────────────────────────────────────────────
  const pasoInstalar = paso(
    "instalar",
    1,
    estadoDe("instalar") === "hecho" ? "Extensión instalada" : "Instala la extensión en Chrome",
    estadoDe("instalar") === "hecho"
      ? extensionAqui === false
        ? "Está conectada en otro navegador: haz la prueba desde ese."
        : null
      : extensionAqui === null
        ? "Revisando si ya está en este navegador…"
        : "Es la que mira las ofertas y postula por ti. Se agrega desde la tienda de Chrome, y al volver a esta pestaña se marca sola.",
    extensionAqui === false ? (
      <>
        <a className="ap-button" href={URL_CHROME_WEB_STORE} target="_blank" rel="noreferrer" onClick={() => marcar(FUE_A_INSTALAR)}>
          <Download size={15} /> Instalar en Chrome
        </a>
        <button type="button" className="ap-mision__enlace" onClick={() => window.location.reload()}>
          Ya la instalé
        </button>
      </>
    ) : undefined
  );

  const faltaCorreo = !correoVerificado || conexion.estado === "falta-correo";
  const pasoConectar = paso(
    "conectar",
    2,
    estadoDe("conectar") === "hecho" ? "Conectada con tu cuenta" : "Conéctala con tu cuenta",
    estadoDe("conectar") === "hecho"
      ? null
      : estadoDe("conectar") === "despues"
        ? "Cuando esté instalada: un clic, sin copiar nada."
        : faltaCorreo
          ? "Primero confirma tu correo con el enlace que te mandamos al registrarte (revisa también spam). Sin eso no se puede conectar."
          : "Un clic, sin copiar nada.",
    faltaCorreo ? undefined : (
      <>
        <button type="button" className="ap-button" onClick={() => void conexion.conectar()} disabled={conexion.estado === "conectando"}>
          <PlugZap size={15} /> {conexion.estado === "conectando" ? "Conectando…" : "Conectar"}
        </button>
        {conexion.error && <p className="ap-mision__aviso" role="alert">{conexion.error}</p>}
      </>
    )
  );

  const tituloMirar = unSoloPortal ? `Mira qué haría en ${unSoloPortal}` : "Mira qué haría con ofertas reales";
  const detalleMirar =
    estadoDe("mirar") === "hecho" ? null
    : estadoDe("mirar") === "despues" ? (enMovil ? "Desde el computador, en esta misma página." : "Cuando esté conectada.")
    : !primeraVez.objetivo ? "Primero cuéntanos qué buscas: con eso se arma la búsqueda en el portal."
    : enMovil ? "Se hace en el computador: en esta misma página vas a tener el botón para abrir tu portal con tu búsqueda."
    : esperandoPortal === "revisando" ? "Revisando lo que miró…"
    : esperandoPortal === "nada"
      ? "Todavía no llega nada del portal. Deja que la extensión termine de revisar la página (el resumen aparece abajo a la derecha) y vuelve acá. Si ya lo viste y te convenció, también puedes activarla ahora."
      : (
        <>
          Se abre {unSoloPortal ?? "el portal que elijas"} con tu búsqueda: {busquedaEnPalabras}.{" "}
          {conRecorrido
            ? "Al llegar, la extensión te muestra en cuatro pasos qué haría con cada oferta y por qué, y te deja elegir a cuáles postular."
            : marcaCadaOferta
            ? "La extensión marca cada oferta con lo que haría y por qué, y al terminar te pregunta si empieza a postular."
            : "La extensión revisa cada oferta y te muestra abajo a la derecha a cuántas postularía y por qué descarta las demás."}{" "}
          <b>No envía nada.</b>
          {extensionAqui === false && " Hazlo en el navegador donde la instalaste."}
        </>
      );
  const accionesMirar = enMovil ? undefined
    : !primeraVez.objetivo ? <Link className="ap-button" href="/dashboard/filtros">Contar qué busco</Link>
    : (
      <>
        {opciones.map((b, i) => (
          <a
            key={b.portal}
            className={i === 0 ? "ap-button" : "ap-button-ghost"}
            href={b.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => irAlPortal(b)}
          >
            Buscar en {b.portal} <ExternalLink size={14} />
          </a>
        ))}
        {esperandoPortal === "nada" && (
          <>
            {/* Con una extensión anterior a la 2.17, si todas las de la página
                calzaban no queda ningún rastro en el servidor (lo que habría
                postulado no se mandaba): que eso no deje a la persona sin salida. */}
            <button type="button" className="ap-button-ghost" onClick={() => void activacion.activar()} disabled={activacion.activando}>
              {activacion.activando ? "Activando…" : "Activar postulación"}
            </button>
            <button
              type="button"
              className="ap-mision__enlace"
              onClick={async () => {
                setEsperandoPortal("revisando");
                await refrescar();
                setEsperandoPortal("nada");
              }}
            >
              Ya terminó, revisar de nuevo
            </button>
            {activacion.aviso && <p className="ap-mision__aviso" role="alert">{activacion.aviso}</p>}
          </>
        )}
      </>
    );
  const pasoMirar = paso("mirar", enMovil ? 2 : 3, tituloMirar, detalleMirar, accionesMirar);

  const pasoDecidir = paso(
    "decidir",
    enMovil ? 3 : 4,
    "Tú decides si empieza a postular",
    estadoDe("decidir") === "ahora" ? (
      <>
        {textoLoQueMiro({ porDecidir, descartadas: primeraVez.descartadas, habriaPostulado: primeraVez.habriaPostulado ?? habriaPostulado })}{" "}
        {textoAlActivar(modo, pruebaTotal)}
      </>
    ) : (
      "Cuando termine de mirar."
    ),
    <>
      <button type="button" className="ap-button" onClick={() => void activacion.activar()} disabled={activacion.activando}>
        {activacion.activando ? "Activando…" : "Activar postulación"}
      </button>
      {porDecidir > 0 && (
        <Link className="ap-button-ghost" href="/dashboard/por-decidir">
          Ver {porDecidir === 1 ? "la que te dejó" : `las ${porDecidir} que te dejó`}
        </Link>
      )}
      {activacion.aviso && <p className="ap-mision__aviso" role="alert">{activacion.aviso}</p>}
    </>
  );

  const pasoComputador = paso(
    "computador",
    1,
    estadoDe("computador") === "hecho" ? "Extensión conectada en tu computador" : "Sigue en tu computador",
    estadoDe("computador") === "hecho"
      ? null
      : "La extensión funciona en Chrome, en un computador. Abre autopostula.cl ahí con esta misma cuenta: esta tarjeta te lleva paso a paso.",
    <button type="button" className="ap-button" onClick={copiarEnlace}>
      <Copy size={15} /> {copiado ? "Enlace copiado" : "Copiar el enlace"}
    </button>
  );

  return (
    <section className="ap-card ap-mision ap-animate-in" aria-labelledby="ap-mision-t">
      <p className="ap-mision__t" id="ap-mision-t">Probemos AutoPostula con ofertas reales</p>
      <p className="ap-mision__s">No envía nada hasta que tú lo digas.</p>
      <ol className="ap-mision__pasos">
        {enMovil ? (
          <>
            {pasoComputador}
            {pasoMirar}
            {pasoDecidir}
          </>
        ) : (
          <>
            {pasoInstalar}
            {pasoConectar}
            {pasoMirar}
            {pasoDecidir}
          </>
        )}
      </ol>
      <div className="ap-mision__pie">
        <button type="button" className="ap-mision__enlace" onClick={ocultar}>
          Ya sé cómo funciona, ocultar
        </button>
      </div>
    </section>
  );
}
