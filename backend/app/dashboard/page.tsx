import { Suspense } from "react";
import Hoy, { HoyCargando, type InicialHoy } from "./Hoy";
import { idDeLaSesion, comoLoDevuelveLaApi } from "@/lib/panel/sesion";
import { armarResumenHoy } from "@/lib/panel/hoy";
import { estadoDelPanel } from "@/lib/panel/estado";

/**
 * docs/optimizacion-2026-09-29.md §1: antes la página llegaba vacía, el
 * teléfono bajaba y corría el JavaScript, y recién ahí pedía los datos. En un
 * celular lento eso era la pantalla de "Cargando lo que te espera..." durante
 * segundos. Ahora el servidor arma los datos mientras manda la página: la misma
 * pantalla de carga se ve solo mientras tanto, y el contenido llega en la
 * misma respuesta, sin esperar al JavaScript.
 */
export default function PaginaHoy() {
  return (
    <Suspense fallback={<HoyCargando />}>
      <HoyConDatos />
    </Suspense>
  );
}

async function HoyConDatos() {
  const userId = await idDeLaSesion();
  if (!userId) return <Hoy />;
  try {
    const [resumen, estado] = await Promise.all([
      armarResumenHoy(userId),
      // Si la barra no se puede armar, las tareas se muestran sin ella, como
      // cuando /api/dashboard/estado fallaba.
      estadoDelPanel(userId).catch(() => null),
    ]);
    const inicial = comoLoDevuelveLaApi<InicialHoy>({ resumen, estado, ahora: new Date() });
    return <Hoy inicial={inicial} />;
  } catch (e) {
    // Mejor que una página de error: que el navegador lo pida, como antes.
    console.error("[hoy] no se pudo armar en el servidor; lo pide el navegador:", e);
    return <Hoy />;
  }
}
