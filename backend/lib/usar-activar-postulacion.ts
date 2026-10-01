"use client";

import { useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { extensionPresente, pedirALaExtension } from "@/lib/puente-extension";
import {
  TEXTO_ACTIVADA_EMPEZO,
  TEXTO_ACTIVADA_MANUAL,
  TEXTO_ACTIVADA_SIN_EXTENSION,
  textoMotivoActivacion,
} from "@/lib/texto-rafaga";

// Lo escucha el aviso de "Todavía no activas la postulación" (BannerModoPrueba):
// vive en el layout, que no se vuelve a armar al navegar, así que si la persona
// la activa desde Hoy, el aviso de las otras páginas se entera por acá.
export const EVENTO_POSTULACION_ACTIVADA = "ap:postulacion-activada";

/**
 * "Activar postulación" (docs/revision-2026-09-16.md §1.2): lo usan el aviso del
 * layout, la tarjeta "Probemos" de Hoy y la tarea que la reemplaza si se oculta
 * (docs/primera-busqueda-guiada.md §10). El servidor solo deja activar con el
 * objetivo confirmado y el perfil compilado; si no, dice qué falta.
 */
export function usarActivarPostulacion(alActivar?: () => void) {
  const { avisar } = useAvisos();
  const [activando, setActivando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // docs/rafagas-y-ponerse-al-dia.md §4.1: apenas la persona activa, se corre una
  // ráfaga de inmediato -- esperar al siguiente chequeo (hasta 60 min) mataría
  // justo el momento en que más interesada está. Ocurre una sola vez: el servidor
  // solo dice `recienActivada` en la llamada que de verdad cambió el estado.
  // Lo que pasó se dice en un aviso: la tarjeta o el aviso que tenía el botón
  // desaparece al activarse.
  async function primeraBusqueda(modo: string | undefined) {
    const titulo = "Postulación activada";
    if (modo === "manual") return avisar("info", titulo, TEXTO_ACTIVADA_MANUAL);
    if (!(await extensionPresente())) return avisar("info", titulo, TEXTO_ACTIVADA_SIN_EXTENSION);
    const r = await pedirALaExtension("activacion");
    if (r.ok) avisar("ok", titulo, TEXTO_ACTIVADA_EMPEZO);
    else avisar("info", titulo, textoMotivoActivacion(r.motivo));
  }

  async function activar(): Promise<boolean> {
    setActivando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/account/habilitar-postulacion", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.dispatchEvent(new CustomEvent(EVENTO_POSTULACION_ACTIVADA));
        alActivar?.();
        if (data.recienActivada) void primeraBusqueda(data.modo);
        return true;
      }
      setAviso(data.error ?? "No se pudo activar la postulación.");
      return false;
    } catch {
      setAviso("No pudimos conectar con el servidor.");
      return false;
    } finally {
      setActivando(false);
    }
  }

  return { activar, activando, aviso };
}
