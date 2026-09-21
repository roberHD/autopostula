// Verificación de los pases prepagados contra una base de datos REAL
// (docs/pase-prepagado.md §10): la acreditación idempotente, el apilado de pases,
// la vigencia por fecha y el rechazo de montos alterados. Es para correr a mano:
//
//   DATABASE_URL=postgresql://.../una_base_de_prueba npx tsx scripts/verificar-pagos.ts
//
// Se niega a correr si el nombre de la base no dice "test": crea y borra usuarios,
// pagos y pases.
import { prisma } from "../lib/prisma";
import { flow, type EstadoPagoFlow } from "../lib/flow";
import { acreditarPago, procesarTokenDePago } from "../lib/pagos";
import { obtenerPlanVigente, obtenerSubscripcionVigente, finDelUltimoPase } from "../lib/plan-vigente";
import { PASES } from "../lib/pases";
import { armarAvisoPase, armarComprobantePase } from "../lib/correo";
import { GET as cronAvisos } from "../app/api/cron/avisos-pase/route";

const url = process.env.DATABASE_URL ?? "";
if (!/test/i.test(url.split("/").pop() ?? "")) {
  console.error("Se niega a correr: DATABASE_URL tiene que apuntar a una base cuyo nombre incluya 'test'.");
  process.exit(2);
}

let fallos = 0;
function check(desc: string, cond: boolean) {
  if (!cond) { fallos++; console.error("✗ " + desc); } else console.log("✓ " + desc);
}

const DIA = 24 * 3_600_000;
const aproxDias = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DIA);

async function usuarioNuevo(nombre: string) {
  return prisma.user.create({
    data: { email: `${nombre}-${crypto.randomUUID()}@prueba.test`, nombre, emailVerificado: new Date() },
  });
}

async function pagoPendiente(userId: string, pase: keyof typeof PASES) {
  return prisma.payment.create({
    data: { userId, pase, dias: PASES[pase].dias, monto: PASES[pase].monto, commerceOrder: `ap_${crypto.randomUUID()}` },
  });
}

const estadoFlow = (commerceOrder: string, status: number, amount = 0, currency = "CLP"): EstadoPagoFlow => ({
  flowOrder: Math.floor(Math.random() * 1e7),
  commerceOrder,
  status,
  amount,
  currency,
  payer: "otra.persona@correo.test",
});

async function main() {
  const usuarios: string[] = [];
  try {
    // 1. Comprar 30 días → Premium activo con periodoFin = hoy + 30; pago PAGADO.
    const u1 = await usuarioNuevo("uno");
    usuarios.push(u1.id);
    check("sin pase, la cuenta es gratis", (await obtenerPlanVigente(u1.id)).tipo === "FREE");
    const p1 = await pagoPendiente(u1.id, "pase_30");
    const r1 = await acreditarPago(p1, estadoFlow(p1.commerceOrder, 2, 3990));
    check("pagar 30 días acredita", r1.estado === "PAGADO" && r1.nuevo === true);
    const vig1 = await obtenerPlanVigente(u1.id);
    check("queda Premium", vig1.tipo === "PREMIUM");
    check("vence en 30 días", !!vig1.venceEn && aproxDias(vig1.venceEn, new Date()) === 30);
    const pago1 = await prisma.payment.findUniqueOrThrow({ where: { id: p1.id } });
    check("el pago queda PAGADO y enlazado al pase", pago1.estado === "PAGADO" && !!pago1.subscriptionId && !!pago1.flowOrder);

    // 4. Flow confirma dos veces el mismo pago → un solo pase.
    const otraVez = await acreditarPago(pago1, estadoFlow(p1.commerceOrder, 2, 3990));
    check("el aviso repetido no acredita otra vez", otraVez.estado === "PAGADO" && otraVez.nuevo === false);
    check("sigue habiendo un solo pase", (await prisma.subscription.count({ where: { userId: u1.id } })) === 1);

    // …y a la vez (confirmación + retorno llegando juntos).
    const u2 = await usuarioNuevo("dos");
    usuarios.push(u2.id);
    const p2 = await pagoPendiente(u2.id, "pase_30");
    await Promise.allSettled([
      acreditarPago(p2, estadoFlow(p2.commerceOrder, 2, 3990)),
      acreditarPago(p2, estadoFlow(p2.commerceOrder, 2, 3990)),
      acreditarPago(p2, estadoFlow(p2.commerceOrder, 2, 3990)),
    ]);
    check("tres avisos simultáneos dan un solo pase", (await prisma.subscription.count({ where: { userId: u2.id } })) === 1);

    // 2. Comprar con un pase vigente → el nuevo empieza cuando termina el anterior.
    const p1b = await pagoPendiente(u1.id, "pase_90");
    await acreditarPago(p1b, estadoFlow(p1b.commerceOrder, 2, 9990));
    const pases = await prisma.subscription.findMany({ where: { userId: u1.id }, orderBy: { periodoInicio: "asc" } });
    check("hay dos pases", pases.length === 2);
    check("el segundo empieza cuando termina el primero", pases[1].periodoInicio!.getTime() === pases[0].periodoFin!.getTime());
    check("el segundo dura 90 días", aproxDias(pases[1].periodoFin!, pases[1].periodoInicio!) === 90);
    const hasta = await finDelUltimoPase(u1.id);
    check("la vigencia total es 30 + 90 días", !!hasta && aproxDias(hasta, new Date()) === 120);

    // 5. El día 31, sin que haya corrido ningún cron, ya es gratis.
    const dia31 = new Date(Date.now() + 31 * DIA);
    check("el día 31 de un pase de 30 sigue Premium solo si hay otro apilado", !!(await obtenerSubscripcionVigente(u1.id, dia31)));
    check("el día 31 la cuenta de un solo pase ya es gratis", (await obtenerSubscripcionVigente(u2.id, dia31)) === null);
    check("y el día 29 todavía es Premium", !!(await obtenerSubscripcionVigente(u2.id, new Date(Date.now() + 29 * DIA))));

    // Dos pagos DISTINTOS del mismo usuario acreditándose a la vez: los pases se
    // apilan (no arrancan los dos en la misma fecha).
    const u5 = await usuarioNuevo("cinco");
    usuarios.push(u5.id);
    const p5a = await pagoPendiente(u5.id, "pase_30");
    const p5b = await pagoPendiente(u5.id, "pase_30");
    await Promise.all([
      acreditarPago(p5a, estadoFlow(p5a.commerceOrder, 2, 3990)),
      acreditarPago(p5b, estadoFlow(p5b.commerceOrder, 2, 3990)),
    ]);
    const pases5 = await prisma.subscription.findMany({ where: { userId: u5.id }, orderBy: { periodoInicio: "asc" } });
    check("dos pagos simultáneos dan dos pases", pases5.length === 2);
    check("y no se pisan: el segundo arranca cuando termina el primero", pases5.length === 2 && pases5[1].periodoInicio!.getTime() === pases5[0].periodoFin!.getTime());

    // 7. Pago rechazado → FALLIDO, sin pase.
    const u3 = await usuarioNuevo("tres");
    usuarios.push(u3.id);
    const p3 = await pagoPendiente(u3.id, "pase_30");
    const r3 = await acreditarPago(p3, estadoFlow(p3.commerceOrder, 3));
    check("un pago rechazado queda FALLIDO", r3.estado === "FALLIDO");
    check("sin pase", (await prisma.subscription.count({ where: { userId: u3.id } })) === 0);
    // Un aviso viejo de "rechazado" no degrada un pago que ya se pagó.
    const degrada = await acreditarPago(pago1, estadoFlow(p1.commerceOrder, 3));
    check("un rechazo tardío no degrada un pago ya PAGADO", degrada.estado === "PAGADO");
    check("el pago sigue PAGADO", (await prisma.payment.findUniqueOrThrow({ where: { id: p1.id } })).estado === "PAGADO");

    // Anulado (status 4) y pendiente (status 1).
    const p3b = await pagoPendiente(u3.id, "pase_30");
    check("anulado → ANULADO", (await acreditarPago(p3b, estadoFlow(p3b.commerceOrder, 4))).estado === "ANULADO");
    const p3c = await pagoPendiente(u3.id, "pase_30");
    check("pendiente no hace nada", (await acreditarPago(p3c, estadoFlow(p3c.commerceOrder, 1))).estado === "PENDIENTE");
    check("y sigue PENDIENTE", (await prisma.payment.findUniqueOrThrow({ where: { id: p3c.id } })).estado === "PENDIENTE");

    // 8. Monto alterado → no se acredita.
    const p3d = await pagoPendiente(u3.id, "pase_90");
    const r3d = await acreditarPago(p3d, estadoFlow(p3d.commerceOrder, 2, 100));
    check("un monto distinto al del catálogo no se acredita", r3d.estado === "ERROR");
    const r3e = await acreditarPago(p3d, estadoFlow(p3d.commerceOrder, 2, 9990, "USD"));
    check("una moneda distinta tampoco", r3e.estado === "ERROR");
    check("sin pase por un pago que no cuadra", (await prisma.subscription.count({ where: { userId: u3.id } })) === 0);
    check("el pago no cuadrado queda PENDIENTE (no PAGADO)", (await prisma.payment.findUniqueOrThrow({ where: { id: p3d.id } })).estado === "PENDIENTE");

    // 3. El pago se identifica por commerceOrder y NO por el correo del pagador:
    // Flow avisa con un `payer` distinto del correo de la cuenta y igual acredita.
    const u4 = await usuarioNuevo("cuatro");
    usuarios.push(u4.id);
    const p4 = await pagoPendiente(u4.id, "pase_30");
    const original = flow.estadoPago;
    flow.estadoPago = async () => estadoFlow(p4.commerceOrder, 2, 3990);
    try {
      const r4 = await procesarTokenDePago("token-de-prueba");
      check("por token: acredita al dueño del pago aunque el pagador tenga otro correo", r4.estado === "PAGADO" && (await obtenerPlanVigente(u4.id)).tipo === "PREMIUM");
      flow.estadoPago = async () => estadoFlow("ap_no_existe", 2, 3990);
      check("un commerceOrder desconocido no revienta ni acredita", (await procesarTokenDePago("x")).estado === "DESCONOCIDO");
    } finally {
      flow.estadoPago = original;
    }

    // 10. Borrar la cuenta con un pase vigente: el pago se conserva sin dueño.
    const paseDe4 = await prisma.payment.findUniqueOrThrow({ where: { id: p4.id } });
    await prisma.user.delete({ where: { id: u4.id } });
    const sobreviviente = await prisma.payment.findUnique({ where: { id: p4.id } });
    check("al borrar la cuenta el pago sobrevive sin dueño", !!sobreviviente && sobreviviente.userId === null);
    check("y el pase también", !!paseDe4.subscriptionId && !!(await prisma.subscription.findUnique({ where: { id: paseDe4.subscriptionId } })));

    // Cron de avisos (§6). Resend se simula: el fetch global cuenta los envíos.
    process.env.CRON_SECRET = "secreto-de-prueba";
    process.env.RESEND_FROM_EMAIL = "AutoPostula <prueba@autopostula.test>";
    process.env.RESEND_API_KEY = "re_prueba";
    const enviados: string[] = [];
    const fetchReal = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      const cuerpo = JSON.parse(String(init?.body ?? "{}"));
      enviados.push(cuerpo.subject);
      return new Response(JSON.stringify({ id: "correo-de-prueba" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const correr = async () => (await cronAvisos(new Request("http://x/api/cron/avisos-pase", { headers: { authorization: "Bearer secreto-de-prueba" } }))).json();
    try {
      const planPremium = await prisma.plan.findFirstOrThrow({ where: { tipo: "PREMIUM" } });
      const pase = (userId: string, iniciaHaceDias: number, terminaEnDias: number) =>
        prisma.subscription.create({
          data: { userId, planId: planPremium.id, estado: "ACTIVA", periodoInicio: new Date(Date.now() - iniciaHaceDias * DIA), periodoFin: new Date(Date.now() + terminaEnDias * DIA) },
        });

      const c1 = await usuarioNuevo("aviso-cinco"); usuarios.push(c1.id);
      const c2 = await usuarioNuevo("aviso-lejos"); usuarios.push(c2.id);
      const c3 = await usuarioNuevo("aviso-apilado"); usuarios.push(c3.id);
      const c4 = await usuarioNuevo("aviso-vencio"); usuarios.push(c4.id);
      const c5 = await usuarioNuevo("aviso-renovo"); usuarios.push(c5.id);
      const c6 = await usuarioNuevo("aviso-sin-verificar", ); usuarios.push(c6.id);
      await prisma.user.update({ where: { id: c6.id }, data: { emailVerificado: null } });
      await pase(c1.id, 26, 4);          // vence en 4 días -> aviso de 5 días
      await pase(c2.id, 10, 20);         // vence en 20 días -> nada
      await pase(c3.id, 26, 4);          // vence en 4 días...
      await pase(c3.id, -4, 30);         // ...pero ya tiene otro apilado -> nada
      await pase(c4.id, 31, -1);         // venció ayer -> "terminó"
      await pase(c5.id, 31, -1);         // venció ayer...
      await pase(c5.id, -0, 30);         // ...pero renovó -> ni terminó ni aviso previo
      await pase(c6.id, 26, 4);          // correo sin verificar -> nada

      const uno = await correr();
      check("cron: manda el aviso de 5 días y el de que terminó, y ninguno más", uno.previos === 1 && uno.finales === 1);
      check("cron: el asunto del previo es el de vencimiento", enviados.some((a) => /vence/.test(a)) && enviados.some((a) => /terminó/.test(a)));
      const dos = await correr();
      check("cron: corrido otra vez no repite ningún aviso", dos.previos === 0 && dos.finales === 0);
      const pc1 = await prisma.subscription.findFirstOrThrow({ where: { userId: c1.id } });
      check("cron: queda registrado el aviso previo", !!pc1.avisoPrevioEn);
      const pc4 = await prisma.subscription.findFirstOrThrow({ where: { userId: c4.id } });
      check("cron: el pase vencido pasa a VENCIDA y queda registrado el aviso final", pc4.estado === "VENCIDA" && !!pc4.avisoFinalEn);
      check("cron: el de un pase que sigue vigente no cambia", (await prisma.subscription.findFirstOrThrow({ where: { userId: c2.id } })).estado === "ACTIVA");
      check("cron: sin secreto no corre", (await cronAvisos(new Request("http://x", { headers: { authorization: "Bearer otro" } }))).status === 401);
    } finally {
      globalThis.fetch = fetchReal;
    }

    // Correos: no dicen "mensual" ni "cargo automático" (criterio 9) y traen lo prometido.
    const compro = armarComprobantePase({ pase: PASES.pase_30.nombre, monto: 3990, desde: new Date(), hasta: new Date(Date.now() + 30 * DIA), flowOrder: "123" });
    check("el comprobante trae monto y orden de Flow", compro.html.includes("3.990") && compro.html.includes("123"));
    check("el comprobante aclara que no es una boleta", /no una boleta/i.test(compro.html));
    const todos = [compro, armarAvisoPase("cinco_dias", new Date()), armarAvisoPase("un_dia", new Date()), armarAvisoPase("vencio", new Date())];
    check("ningún correo habla de renovación automática ni de suscripción mensual", todos.every((c) => !/mensual|cargo autom[aá]tico|cancelar suscripci/i.test(c.subject + c.html)));
    check("los avisos llevan a renovar 30 y 90 días", armarAvisoPase("cinco_dias", new Date()).html.includes("pase=pase_30") && armarAvisoPase("cinco_dias", new Date()).html.includes("pase=pase_90"));
  } finally {
    await prisma.payment.deleteMany({ where: { OR: [{ userId: { in: usuarios } }, { commerceOrder: { startsWith: "ap_" } }] } });
    await prisma.subscription.deleteMany({ where: { OR: [{ userId: { in: usuarios } }, { userId: null }] } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
  }

  console.log("\n" + (fallos === 0 ? "Todo OK (0 fallos)." : `${fallos} fallo(s).`));
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
