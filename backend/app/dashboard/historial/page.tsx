import { Suspense } from "react";
import Postulaciones, { type InicialPostulaciones } from "./Postulaciones";
import { idDeLaSesion, comoLoDevuelveLaApi } from "@/lib/panel/sesion";
import { listarPostulaciones, listarSinNoticias } from "@/lib/panel/listas";

/**
 * docs/optimizacion-2026-09-29.md §1: la lista llega armada desde el servidor,
 * en la misma respuesta que la página, en vez de pedirse cuando el teléfono
 * termina de bajar y correr el JavaScript. Mientras tanto se ve la misma
 * pantalla de carga de siempre.
 */
export default function PaginaPostulaciones() {
  return (
    <Suspense fallback={<Postulaciones soloEsqueleto />}>
      <PostulacionesConDatos />
    </Suspense>
  );
}

async function PostulacionesConDatos() {
  const userId = await idDeLaSesion();
  if (!userId) return <Postulaciones />;
  try {
    const [lista, sinNoticias] = await Promise.all([
      listarPostulaciones(userId),
      // "¿Supiste algo?" es un extra: si falla, la lista se muestra igual.
      listarSinNoticias(userId).catch(() => null),
    ]);
    const inicial = comoLoDevuelveLaApi<InicialPostulaciones>({ ...lista, sinNoticias });
    return <Postulaciones inicial={inicial} />;
  } catch (e) {
    console.error("[postulaciones] no se pudo armar en el servidor; la pide el navegador:", e);
    return <Postulaciones />;
  }
}
