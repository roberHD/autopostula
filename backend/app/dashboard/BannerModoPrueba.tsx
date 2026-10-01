"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { EVENTO_POSTULACION_ACTIVADA, usarActivarPostulacion } from "@/lib/usar-activar-postulacion";

// docs/revision-2026-09-16.md §1.2: toda cuenta nueva parte con
// postulacionHabilitada=false -- la extensión escanea y puntúa, pero nunca
// postula de verdad, sin importar el toggle "Solo observar" del popup. Este
// aviso deja activarla desde cualquier página del panel, y solo se puede
// activar cuando el backend confirma que hay objetivo + perfil compilado (si
// no, /api/account/habilitar-postulacion responde 400 con el motivo).
//
// docs/primera-busqueda-guiada.md §10: en Hoy no aparece. Ahí lo dice la propia
// página -- la tarjeta "Probemos", que termina en este mismo botón, o una tarea
// si la persona la ocultó --, y el aviso repetía lo mismo con otras palabras.
// Antes además pedía "revisa qué habría postulado", y no había dónde verlo.
export default function BannerModoPrueba({ habilitadaAlCargar }: { habilitadaAlCargar: boolean }) {
  const pathname = usePathname();
  const [habilitada, setHabilitada] = useState(habilitadaAlCargar);
  const { activar, activando, aviso } = usarActivarPostulacion(() => setHabilitada(true));

  // El layout no se vuelve a armar al navegar: si se activó desde Hoy, avisa acá.
  useEffect(() => {
    const alActivar = () => setHabilitada(true);
    window.addEventListener(EVENTO_POSTULACION_ACTIVADA, alActivar);
    return () => window.removeEventListener(EVENTO_POSTULACION_ACTIVADA, alActivar);
  }, []);

  if (habilitada || pathname === "/dashboard") return null;

  return (
    <div className="ap-cartel-maqueta" role="status">
      <ShieldAlert size={17} />
      <div>
        <p className="ap-cartel-maqueta__t">Todavía no activas la postulación</p>
        <p className="ap-cartel-maqueta__d">
          La extensión mira tus ofertas y te dice qué haría con cada una, pero no envía ninguna hasta
          que la actives.
          {" "}
          <button
            type="button"
            onClick={() => void activar()}
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
