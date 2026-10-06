// Verificación de los consentimientos (lib/consentimiento.ts, Ley 21.719). Se
// prueba contra la base de verdad, con cuentas de mentira que se borran al final:
//   npx tsx scripts/verificar-consentimiento.ts
//
// Si algo falla a la mitad, las cuentas quedan con el prefijo de abajo y se
// pueden borrar a mano sin tocar nada real.
import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  VERSION_DOCUMENTOS,
  aceptoDocumentosVigentes,
  autorizaDatosSensibles,
  registrarAceptacion,
  registrarDatosSensibles,
  revocarDatosSensibles,
} from "../lib/consentimiento";

const PREFIJO = "verificar-consentimiento-";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

async function main() {
  const { id } = await prisma.user.create({
    data: { email: `${PREFIJO}${Date.now()}@ejemplo.invalid` },
    select: { id: true },
  });

  try {
    // ── Términos, política y mayoría de edad ──
    check("una cuenta sin nada anotado no ha aceptado", !(await aceptoDocumentosVigentes(id)));

    await prisma.consentimiento.create({ data: { userId: id, tipo: "TERMINOS_Y_PRIVACIDAD", version: VERSION_DOCUMENTOS, origen: "registro" } });
    check("aceptar los términos sin declarar la mayoría de edad no alcanza", !(await aceptoDocumentosVigentes(id)));
    await prisma.consentimiento.deleteMany({ where: { userId: id } });

    await prisma.consentimiento.createMany({
      data: [
        { userId: id, tipo: "TERMINOS_Y_PRIVACIDAD", version: "2020-01-01", origen: "registro" },
        { userId: id, tipo: "MAYORIA_DE_EDAD", version: "2020-01-01", origen: "registro" },
      ],
    });
    check("una aceptación de una versión vieja de la política no cuenta", !(await aceptoDocumentosVigentes(id)));

    await registrarAceptacion(id, "aceptar");
    check("aceptar la versión vigente sí cuenta", await aceptoDocumentosVigentes(id));
    const filas = await prisma.consentimiento.findMany({ where: { userId: id, version: VERSION_DOCUMENTOS } });
    check(
      "queda anotado qué se aceptó, la versión, desde dónde y cuándo",
      filas.length === 2 && filas.every((f) => f.origen === "aceptar" && f.aceptadoEn instanceof Date),
      filas
    );

    // ── Datos sensibles del CV ──
    await prisma.cvProfile.create({ data: { userId: id, nombreArchivo: "cv.pdf", textoExtraido: "Texto del CV", nombre: "Nombre" } });
    check("sin autorización, no autoriza", !(await autorizaDatosSensibles(id)));

    await registrarDatosSensibles(id);
    await registrarDatosSensibles(id);
    check("autorizar dos veces deja una sola autorización vigente", (await prisma.consentimiento.count({ where: { userId: id, tipo: "DATOS_SENSIBLES_CV" } })) === 1);
    check("con la autorización, autoriza", await autorizaDatosSensibles(id));

    await revocarDatosSensibles(id);
    check("al retirarla deja de autorizar", !(await autorizaDatosSensibles(id)));
    const cv = await prisma.cvProfile.findUnique({ where: { userId: id } });
    check("...se borra el texto del CV y el nombre del archivo", cv?.textoExtraido === null && cv?.nombreArchivo === null, cv);
    check("...pero quedan los datos que la persona escribió", cv?.nombre === "Nombre");
    const revocada = await prisma.consentimiento.findFirst({ where: { userId: id, tipo: "DATOS_SENSIBLES_CV" } });
    check("...y la fila no se borra: queda con su fecha de revocación (no es retroactiva)", !!revocada?.revocadoEn, revocada);

    await registrarDatosSensibles(id);
    check("se puede volver a autorizar después", await autorizaDatosSensibles(id));
  } finally {
    await prisma.user.delete({ where: { id } }); // borra en cascada sus consentimientos y su CV
  }

  console.log(fallos ? `\n${fallos} falla(s)` : "\nTodo OK");
  process.exit(fallos ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
