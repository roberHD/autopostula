import { prisma } from "@/lib/prisma";
import { VERSION_DATOS_SENSIBLES, VERSION_DOCUMENTOS } from "@/lib/textos-consentimiento";

/**
 * Consentimientos (Ley 19.628 modificada por la Ley 21.719).
 *
 * Art. 12: el consentimiento tiene que ser previo, específico e inequívoco, y
 * "corresponde al responsable probar que contó con el consentimiento". Antes el
 * registro decía "al crear tu cuenta aceptas…" sin casilla y sin guardar nada:
 * no había cómo probarlo. Ahora cada aceptación queda en la tabla
 * consentimientos, con la versión del texto y la fecha.
 *
 * Dos cosas distintas:
 *  - Términos y política + declaración de mayoría de edad: se piden al
 *    registrarse, o al entrar al panel si la cuenta no los tiene en la versión
 *    vigente (cuentas de Google, cuentas anteriores, o cuando cambia la política).
 *  - Datos sensibles del CV (art. 16): autorización expresa antes de subirlo.
 *    Se puede retirar cuando se quiera (art. 12) y retirarla borra el CV.
 */

export { VERSION_DOCUMENTOS, VERSION_DATOS_SENSIBLES, TEXTO_DATOS_SENSIBLES } from "@/lib/textos-consentimiento";

/** ¿Aceptó los términos y la política vigentes, y declaró ser mayor de edad? */
export async function aceptoDocumentosVigentes(userId: string): Promise<boolean> {
  const filas = await prisma.consentimiento.findMany({
    where: {
      userId,
      revocadoEn: null,
      OR: [
        { tipo: "TERMINOS_Y_PRIVACIDAD", version: VERSION_DOCUMENTOS },
        { tipo: "MAYORIA_DE_EDAD" },
      ],
    },
    select: { tipo: true },
  });
  const tipos = new Set(filas.map((f) => f.tipo));
  return tipos.has("TERMINOS_Y_PRIVACIDAD") && tipos.has("MAYORIA_DE_EDAD");
}

/** Lo que se anota al aceptar términos, política y mayoría de edad. */
export function filasAceptacion(origen: "registro" | "aceptar") {
  return [
    { tipo: "TERMINOS_Y_PRIVACIDAD" as const, version: VERSION_DOCUMENTOS, origen },
    { tipo: "MAYORIA_DE_EDAD" as const, version: VERSION_DOCUMENTOS, origen },
  ];
}

export async function registrarAceptacion(userId: string, origen: "registro" | "aceptar") {
  await prisma.consentimiento.createMany({
    data: filasAceptacion(origen).map((f) => ({ ...f, userId })),
  });
}

/** ¿Tiene una autorización vigente (no retirada) para los datos sensibles del CV? */
export async function autorizaDatosSensibles(userId: string): Promise<boolean> {
  const fila = await prisma.consentimiento.findFirst({
    where: { userId, tipo: "DATOS_SENSIBLES_CV", revocadoEn: null },
    select: { id: true },
  });
  return !!fila;
}

/** Anota la autorización del CV, si no había una vigente. */
export async function registrarDatosSensibles(userId: string) {
  if (await autorizaDatosSensibles(userId)) return;
  await prisma.consentimiento.create({
    data: { userId, tipo: "DATOS_SENSIBLES_CV", version: VERSION_DATOS_SENSIBLES, origen: "cv" },
  });
}

/**
 * Retira la autorización del CV. Sin ella no se pueden seguir tratando los
 * datos sensibles que traiga, así que se borra el texto del CV y el nombre del
 * archivo. Los datos del perfil que la persona escribió o corrigió se quedan:
 * los puede editar o borrar ella misma.
 */
export async function revocarDatosSensibles(userId: string) {
  await prisma.$transaction([
    prisma.consentimiento.updateMany({
      where: { userId, tipo: "DATOS_SENSIBLES_CV", revocadoEn: null },
      data: { revocadoEn: new Date() },
    }),
    prisma.cvProfile.updateMany({
      where: { userId },
      data: { textoExtraido: null, nombreArchivo: null },
    }),
  ]);
}
