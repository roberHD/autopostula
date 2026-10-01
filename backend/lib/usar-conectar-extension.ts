"use client";

import { useEffect, useRef, useState } from "react";

export type EstadoConexion = "libre" | "conectando" | "ok" | "error" | "falta-correo";

/**
 * "Conectar la extensión" con un clic (extension/bridge.js): pide el token de la
 * cuenta, se lo pasa a la extensión de este navegador por un evento del DOM y
 * espera que conteste. Es el mismo protocolo que usan el onboarding y Portales;
 * lo usa la tarjeta "Probemos" de Hoy (docs/primera-busqueda-guiada.md §10).
 *
 * Al conectar, avisa al servidor (/api/account/extension-conectada) para que el
 * panel lo sepa al tiro, sin esperar a que la extensión pida su perfil.
 */
export function usarConectarExtension(alConectar?: () => void) {
  const [estado, setEstado] = useState<EstadoConexion>("libre");
  const [error, setError] = useState<string | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Si sigue esperando la respuesta de la extensión (lo lee el tope de 4 s).
  const esperando = useRef(false);
  // La función más reciente, sin volver a registrar los oyentes en cada render.
  const alConectarRef = useRef(alConectar);
  useEffect(() => {
    alConectarRef.current = alConectar;
  });

  useEffect(() => {
    const limpiar = () => {
      if (espera.current) clearTimeout(espera.current);
    };
    const conectado = () => {
      limpiar();
      esperando.current = false;
      setEstado("ok");
      setError(null);
      fetch("/api/account/extension-conectada", { method: "POST" }).catch((e) => {
        console.error("No se pudo guardar que la extensión quedó conectada:", e);
      });
      alConectarRef.current?.();
    };
    const fallo = (e: Event) => {
      limpiar();
      esperando.current = false;
      setEstado("error");
      setError((e as CustomEvent).detail?.error ?? "No se pudo conectar la extensión.");
    };
    window.addEventListener("autopostula:conectado", conectado);
    window.addEventListener("autopostula:error-conexion", fallo);
    return () => {
      window.removeEventListener("autopostula:conectado", conectado);
      window.removeEventListener("autopostula:error-conexion", fallo);
      limpiar();
    };
  }, []);

  async function conectar() {
    setEstado("conectando");
    setError(null);
    let token: string | null = null;
    try {
      const res = await fetch("/api/account/token", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      // docs/verificacion-de-correo.md §7: sin el correo confirmado no hay token.
      if (data.requiereVerificacion) {
        setEstado("falta-correo");
        return;
      }
      token = res.ok ? (data.apiToken ?? null) : null;
      if (!token) {
        setEstado("error");
        setError(data.error ?? "No se pudo generar el token.");
        return;
      }
    } catch {
      setEstado("error");
      setError("No pudimos conectar con el servidor.");
      return;
    }
    esperando.current = true;
    window.dispatchEvent(new CustomEvent("autopostula:conectar", { detail: { token } }));
    // Si la extensión no contesta, que el botón no quede pegado en "Conectando…".
    espera.current = setTimeout(() => {
      if (!esperando.current) return;
      esperando.current = false;
      setEstado("error");
      setError("La extensión no respondió. Recarga la página e inténtalo de nuevo.");
    }, 4000);
  }

  return { conectar, estado, error };
}
