"use client";

import { useEffect } from "react";

// Cuenta las horas de uso del panel para las monedas (lib/monedas.ts): mientras
// la pestaña está a la vista, avisa una vez por hora de reloj. La hora que vale
// la decide el servidor; la de acá solo evita mandar un aviso por minuto.
// Si el aviso gana una moneda, se lo cuenta al widget de Perfil (MonedasPerfil)
// con un evento, para que el número suba sin recargar.
const LLAVE = "ap-hora-uso";
const CADA_MS = 60_000;

export const EVENTO_MONEDAS = "ap-monedas";

function leer() {
  try { return localStorage.getItem(LLAVE); } catch { return null; }
}
function guardar(hora: string) {
  try { localStorage.setItem(LLAVE, hora); } catch { /* sin almacenamiento: avisa de nuevo, el servidor no suma dos */ }
}

export default function LatidoUso() {
  useEffect(() => {
    let enCurso = false;
    async function latir() {
      if (enCurso || document.visibilityState !== "visible") return;
      const hora = new Date().toISOString().slice(0, 13);
      if (leer() === hora) return;
      enCurso = true;
      try {
        const res = await fetch("/api/monedas/latido", { method: "POST" });
        if (!res.ok) return;
        guardar(hora);
        const data = await res.json().catch(() => null);
        if (data?.ganada && typeof data.saldo === "number") {
          window.dispatchEvent(new CustomEvent(EVENTO_MONEDAS, { detail: { saldo: data.saldo } }));
        }
      } catch {
        // Sin red: se reintenta en el próximo minuto.
      } finally {
        enCurso = false;
      }
    }
    latir();
    const intervalo = setInterval(latir, CADA_MS);
    document.addEventListener("visibilitychange", latir);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", latir);
    };
  }, []);
  return null;
}
