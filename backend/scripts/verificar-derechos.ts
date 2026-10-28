// Verificación de las solicitudes de derechos (lib/derechos.ts; Ley 21.719,
// art. 11). Contra la base de verdad, con cuentas de mentira que se borran al
// final, y SIN mandar correos: el envío se reemplaza por uno que los anota.
//   npx tsx scripts/verificar-derechos.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  avisarSolicitudesPorVencer, cerrarSolicitud, crearSolicitud, envio, prorrogarSolicitud, solicitudesPorVencer,
} from "../lib/derechos";

const PREFIJO = "verificar-derechos-";
const DIA = 24 * 3_600_000;

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

type Correo = { para: string | string[]; asunto: string; html: string };
const enviados: Correo[] = [];
envio.correo = async (para, asunto, html) => { enviados.push({ para, asunto, html }); };
process.env.SOPORTE_EMAIL = "equipo@ejemplo.invalid";

async function main() {
  const cuenta = await prisma.user.create({
    data: { email: `${PREFIJO}${Date.now()}@ejemplo.invalid` },
    select: { id: true, email: true },
  });
  const ids: string[] = [];

  try {
    // ── Crear: acuse al titular y aviso al equipo, con plazo de 30 días ──
    const recibida = new Date("2026-11-02T15:00:00Z");
    const s = await crearSolicitud({ userId: cuenta.id, email: cuenta.email, tipo: "SUPRESION", detalle: "Quiero que borren mi RUT.", origen: "panel", recibidaEn: recibida });
    ids.push(s.id);
    check("el plazo es 30 días corridos desde que llegó", s.venceEn.getTime() - recibida.getTime() === 30 * DIA);
    check("queda RECIBIDA", s.estado === "RECIBIDA");
    check("manda el acuse de recibo al titular", enviados.some((c) => c.para === cuenta.email && /Recibimos tu solicitud/.test(c.asunto)));
    check("...y avisa al equipo", enviados.some((c) => c.para === "equipo@ejemplo.invalid" && /\[Derechos\]/.test(c.asunto)));

    // ── Prorrogar: una sola vez, 30 días más, con aviso ──
    const vencePrevio = s.venceEn.getTime();
    // Para poder prorrogar tiene que estar en plazo: se la deja recién llegada.
    await prisma.solicitudDerecho.update({ where: { id: s.id }, data: { recibidaEn: new Date(), venceEn: new Date(Date.now() + 30 * DIA) } });
    const antes = (await prisma.solicitudDerecho.findUnique({ where: { id: s.id } }))!.venceEn.getTime();
    let r = await prorrogarSolicitud(s.id, "Tenemos que revisar los registros de pago.");
    const trasProrroga = await prisma.solicitudDerecho.findUnique({ where: { id: s.id } });
    check("prorrogar suma 30 días al plazo", r.ok && trasProrroga!.venceEn.getTime() - antes === 30 * DIA && vencePrevio > 0);
    check("...queda PRORROGADA con el motivo guardado", trasProrroga?.estado === "PRORROGADA" && !!trasProrroga?.motivoProrroga);
    check("...y se le avisa al titular", enviados.some((c) => c.para === cuenta.email && /más tiempo/.test(c.asunto)));
    r = await prorrogarSolicitud(s.id, "Otra vez.");
    check("no se puede prorrogar dos veces (la ley permite una)", !r.ok);

    // ── Rechazar: guarda el texto y avisa del reclamo ante la Agencia ──
    r = await cerrarSolicitud(s.id, "RECHAZADA", "El RUT lo necesitamos para la boleta del pago que hiciste.");
    const rechazada = await prisma.solicitudDerecho.findUnique({ where: { id: s.id } });
    check("rechazar la cierra con la respuesta y la fecha guardadas", r.ok && rechazada?.estado === "RECHAZADA" && !!rechazada.respondidaEn && /boleta/.test(rechazada.respuesta ?? ""));
    const correoRechazo = enviados.filter((c) => c.para === cuenta.email && /Respuesta/.test(c.asunto)).pop();
    check("el correo de rechazo dice que puede reclamar ante la Agencia en 30 días hábiles", !!correoRechazo && /Agencia de Protección de Datos Personales/.test(correoRechazo.html) && /30 días hábiles/.test(correoRechazo.html));
    r = await cerrarSolicitud(s.id, "RESPONDIDA", "Respuesta tardía.");
    check("una solicitud cerrada no se vuelve a responder", !r.ok);

    // ── Responder: sin el aviso de la Agencia ──
    const s2 = await crearSolicitud({ userId: cuenta.id, email: cuenta.email, tipo: "ACCESO", detalle: "Qué datos tienen de mí.", origen: "panel" });
    ids.push(s2.id);
    await cerrarSolicitud(s2.id, "RESPONDIDA", "Tenemos tu correo, tu CV y tus postulaciones.");
    const correoResp = enviados.filter((c) => c.para === cuenta.email && /Respuesta/.test(c.asunto)).pop();
    check("responder no agrega el aviso de reclamo", !!correoResp && !/Agencia de Protección/.test(correoResp.html));

    // ── Si el correo no sale, no se guarda nada ──
    const s3 = await crearSolicitud({ userId: cuenta.id, email: cuenta.email, tipo: "OPOSICION", detalle: "Me opongo a los recordatorios.", origen: "panel" });
    ids.push(s3.id);
    const real = envio.correo;
    envio.correo = async () => { throw new Error("Resend caído"); };
    let lanzo = false;
    try { await cerrarSolicitud(s3.id, "RESPONDIDA", "Listo, ya no te llegan."); } catch { lanzo = true; }
    envio.correo = real;
    const s3db = await prisma.solicitudDerecho.findUnique({ where: { id: s3.id } });
    check("si el correo al titular falla, la solicitud sigue abierta (no queda 'respondida' sin que lo sepa)", lanzo && s3db?.estado === "RECIBIDA" && !s3db.respuesta);

    // ── Aviso diario de las que vencen ──
    await prisma.solicitudDerecho.update({ where: { id: s3.id }, data: { venceEn: new Date(Date.now() + 2 * DIA) } });
    const porVencer = await solicitudesPorVencer();
    check("una que vence en 2 días aparece en el aviso", porVencer.some((x) => x.id === s3.id));
    const avisadas = await avisarSolicitudesPorVencer();
    check("el aviso sale y la marca", avisadas >= 1 && enviados.some((c) => /por vencer/.test(c.asunto)));
    check("no se repite el mismo día", !(await solicitudesPorVencer()).some((x) => x.id === s3.id));

    // ── Sobrevive al borrado de la cuenta (es el respaldo que pide la ley) ──
    await prisma.user.delete({ where: { id: cuenta.id } });
    const tras = await prisma.solicitudDerecho.findMany({ where: { id: { in: ids } } });
    check("al borrar la cuenta, las solicitudes quedan, sin cuenta pero con el correo y la respuesta", tras.length === 3 && tras.every((x) => x.userId === null && x.email === cuenta.email));
  } finally {
    await prisma.solicitudDerecho.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: cuenta.id } });
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
