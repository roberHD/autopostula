import { Suspense } from "react";
import PorDecidir, { type InicialPorDecidir } from "./PorDecidir";
import { idDeLaSesion, comoLoDevuelveLaApi } from "@/lib/panel/sesion";
import { listarPorDecidir, leerEstadoExtension } from "@/lib/panel/listas";

/**
 * docs/optimizacion-2026-09-29.md §1: las tarjetas llegan armadas desde el
 * servidor, en la misma respuesta que la página, en vez de pedirse cuando el
 * teléfono termina de bajar y correr el JavaScript. Mientras tanto se ve el
 * mismo "Cargando..." de siempre.
 */
export default function PaginaPorDecidir() {
  return (
    <Suspense fallback={<PorDecidir soloEsqueleto />}>
      <PorDecidirConDatos />
    </Suspense>
  );
}

async function PorDecidirConDatos() {
  const userId = await idDeLaSesion();
  if (!userId) return <PorDecidir />;
  try {
    const [cola, estadoExt] = await Promise.all([
      listarPorDecidir(userId),
      // El aviso de "solo mira" es un extra: si falla, las tarjetas se muestran igual.
      leerEstadoExtension(userId).catch(() => null),
    ]);
    const inicial = comoLoDevuelveLaApi<InicialPorDecidir>({ ...cola, estadoExt, ahora: new Date() });
    return <PorDecidir inicial={inicial} />;
  } catch (e) {
    console.error("[por-decidir] no se pudo armar en el servidor; la pide el navegador:", e);
    return <PorDecidir />;
  }
}
