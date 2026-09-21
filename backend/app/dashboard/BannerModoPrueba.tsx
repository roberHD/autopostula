"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAvisos } from "@/components/Avisos";
import { extensionPresente, pedirALaExtension } from "@/lib/puente-extension";
import {
  TEXTO_ACTIVADA_EMPEZO,
  TEXTO_ACTIVADA_MANUAL,
  TEXTO_ACTIVADA_SIN_EXTENSION,
  textoMotivoActivacion,
} from "@/lib/texto-rafaga";

// docs/revision-2026-09-16.md §1.2: toda cuenta nueva parte con
// postulacionHabilitada=false -- la extensión escanea y puntúa, pero nunca
// postula de verdad, sin importar el toggle "Solo observar" del popup. Este
// banner es la única forma de activarla, y solo se puede activar cuando el
// backend confirma que hay objetivo + perfil compilado (si no, /api/account/
// habilitar-postulacion responde 400 con el motivo).
export default function BannerModoPrueba({ habilitadaAlCargar }: { habilitadaAlCargar: boolean }) {
  const { avisar } = useAvisos();
  const [habilitada, setHabilitada] = useState(habilitadaAlCargar);
  const [activando, setActivando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (habilitada) return null;

  // docs/rafagas-y-ponerse-al-dia.md §4.1: apenas la persona activa, se corre una
  // ráfaga de inmediato -- esperar al siguiente chequeo (hasta 60 min) mataría
  // justo el momento en que más interesada está. Ocurre una sola vez: el servidor
  // solo dice `recienActivada` en la llamada que de verdad cambió el estado.
  // El banner desaparece al activarse, así que lo que pasó se dice en un aviso.
  async function primeraBusqueda(modo: string | undefined) {
    const titulo = "Postulación activada";
    if (modo === "manual") return avisar("info", titulo, TEXTO_ACTIVADA_MANUAL);
    if (!(await extensionPresente())) return avisar("info", titulo, TEXTO_ACTIVADA_SIN_EXTENSION);
    const r = await pedirALaExtension("activacion");
    if (r.ok) avisar("ok", titulo, TEXTO_ACTIVADA_EMPEZO);
    else avisar("info", titulo, textoMotivoActivacion(r.motivo));
  }

  async function activar() {
    setActivando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/account/habilitar-postulacion", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setHabilitada(true);
        if (data.recienActivada) void primeraBusqueda(data.modo);
      } else {
        setAviso(data.error ?? "No se pudo activar la postulación.");
      }
    } catch {
      setAviso("No pudimos conectar con el servidor.");
    } finally {
      setActivando(false);
    }
  }

  return (
    <div className="ap-cartel-maqueta" role="status">
      <ShieldAlert size={17} />
      <div>
        <p className="ap-cartel-maqueta__t">Tu cuenta está en modo prueba</p>
        <p className="ap-cartel-maqueta__d">
          La extensión escanea y puntúa ofertas, pero no envía ninguna postulación todavía. Revisa
          qué habría postulado y actívala cuando confíes en el resultado.
          {" "}
          <button
            type="button"
            onClick={activar}
            disabled={activando}
            style={{
              background: "none", border: "none", padding: 0, font: "inherit",
              color: "inherit", textDecoration: "underline", cursor: activando ? "default" : "pointer",
            }}
          >
            {activando ? "Activando…" : "Activar postulación"}
          </button>
          {aviso && <> — {aviso}</>}
        </p>
      </div>
    </div>
  );
}
