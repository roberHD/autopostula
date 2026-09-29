import { limpiarTitulo } from "@/lib/text";
import { urlDePortal } from "@/lib/entrada";

// docs/revision-2026-09-28.md §1: lo que la persona ve de cada postulación
// (cargo, empresa, enlace, match) sale de la copia que guardó SU postulación
// al crearse, no de la oferta compartida (JobOffer), que la extensión de
// cualquier cuenta actualiza. Antes, otra cuenta podía cambiarle la empresa y
// el enlace "Ver oferta" a una postulación ajena.
//
// La migración 20260928210000_revision_seguridad copió los valores de ese
// momento a todas las postulaciones que ya existían, así que acá no se vuelve a
// mirar la oferta compartida para la empresa ni el enlace: una postulación sin
// esos datos se muestra sin ellos. El título sí cae a la oferta si faltara
// (no debería: se guarda siempre al crear).
type PostulacionConOferta = {
  titulo?: string | null;
  empresa?: string | null;
  url?: string | null;
  jobOffer: { titulo: string; platform?: { nombre: string } | null };
};

export function datosDeLaOferta(a: PostulacionConOferta) {
  return {
    titulo: limpiarTitulo(a.titulo || a.jobOffer.titulo),
    empresa: a.empresa ?? null,
    // Se revisa también al leer: una fila vieja pudo guardarse antes de que se
    // validara la dirección al llegar.
    url: urlDePortal(a.url, a.jobOffer.platform?.nombre ?? null),
  };
}
