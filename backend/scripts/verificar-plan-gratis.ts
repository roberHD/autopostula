// Verificación del plan gratis de 10 al mes, con la prueba automática aparte
// (docs/creditos-y-pagina-nueva.md §3.7), contra una base de PRUEBA:
//
//   DATABASE_URL=postgresql://.../una_base_test npx tsx scripts/verificar-plan-gratis.ts
//
// Se niega a correr si el nombre de la base no dice "test": crea y borra cuentas,
// ofertas y postulaciones. Llama a las rutas de verdad (/api/applications,
// /api/extension/puede-postular, /api/account/estado-automatico) con un token
// como el de la extensión.
import { prisma } from "../lib/prisma";
import { hashToken } from "../lib/token";
import { POSTULACIONES_GRATIS_AL_MES } from "../lib/plan-gratis";
import { PLANES_BASE } from "../lib/plans";
import { PRUEBA_TOTAL } from "../lib/estado-automatico";
import { obtenerEstadoPostulaciones } from "../lib/postulacion-limits";
import { anotarExtra, saldoExtras } from "../lib/extras";
import { POST as rutaPostular } from "../app/api/applications/route";
import { GET as rutaPuedePostular } from "../app/api/extension/puede-postular/route";
import { GET as rutaEstadoAutomatico } from "../app/api/account/estado-automatico/route";

const url = process.env.DATABASE_URL ?? "";
if (!/test/i.test(url.split("/").pop() ?? "")) {
  console.error("Se niega a correr: DATABASE_URL tiene que apuntar a una base cuyo nombre incluya 'test'.");
  process.exit(2);
}

const PREFIJO = "verificar-plan-gratis-";
const PORTAL = "Computrabajo";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else console.log("✓ " + desc);
}

const unico = () => `${PREFIJO}${crypto.randomUUID()}`;

type Cuenta = Awaited<ReturnType<typeof cuentaGratis>>;

async function cuentaGratis() {
  const token = unico();
  const plataforma = await prisma.jobPlatform.upsert({
    where: { nombre: PORTAL },
    update: {},
    create: { nombre: PORTAL, urlBase: "https://cl.computrabajo.com", adapterVersion: "prueba" },
  });
  // Sin correo verificado: así la ruta no intenta mandar el correo de fin de prueba.
  const user = await prisma.user.create({ data: { email: `${unico()}@prueba.test`, apiToken: hashToken(token) } });
  const cuentaPortal = await prisma.platformAccount.create({ data: { userId: user.id, platformId: plataforma.id, activa: true } });
  const cv = await prisma.cvProfile.create({ data: { userId: user.id, textoExtraido: "CV de prueba" } });
  return { user, token, plataforma, cuentaPortal, cv };
}

// Postulaciones que ya salieron este mes, directo en la base.
async function yaPostulo(c: Cuenta, cantidad: number, esDePrueba = false) {
  for (let i = 0; i < cantidad; i++) {
    const oferta = await prisma.jobOffer.create({
      data: { platformId: c.plataforma.id, externalId: unico(), titulo: "Oferta de prueba" },
    });
    await prisma.application.create({
      data: {
        userId: c.user.id,
        jobOfferId: oferta.id,
        platformAccountId: c.cuentaPortal.id,
        cvProfileId: c.cv.id,
        estadoActual: "ENVIADO",
        origenEstado: "SISTEMA",
        esDePrueba,
      },
    });
  }
}

async function postular(c: Cuenta, cuerpo: Record<string, unknown> = {}) {
  const res = await rutaPostular(
    new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
      body: JSON.stringify({ platformNombre: PORTAL, externalId: unico(), titulo: "Oferta nueva", ...cuerpo }),
    })
  );
  return { status: res.status, cuerpo: await res.json() };
}

async function puedePostular(c: Cuenta, origen?: "rafaga") {
  const q = new URLSearchParams({ plataforma: PORTAL, ...(origen ? { origen } : {}) });
  const res = await rutaPuedePostular(
    new Request(`http://localhost/api/extension/puede-postular?${q}`, { headers: { authorization: `Bearer ${c.token}` } })
  );
  return res.json();
}

async function estadoAutomatico(c: Cuenta) {
  const res = await rutaEstadoAutomatico(
    new Request("http://localhost/api/account/estado-automatico?prueba=1", { headers: { authorization: `Bearer ${c.token}` } })
  );
  return res.json();
}

async function main() {
  try {
    // ── Los números ──────────────────────────────────────────────────────
    const libre = PLANES_BASE.find((p) => p.tipo === "FREE")!;
    check("el plan gratis tiene 10 al mes, en un solo número", POSTULACIONES_GRATIS_AL_MES === 10 && libre.limitePostulacionesMes === 10, libre.limitePostulacionesMes);

    const nueva = await cuentaGratis();
    let estado = await obtenerEstadoPostulaciones(nueva.user.id);
    check("una cuenta gratis nueva parte con 10 del mes", estado.limite === 10 && estado.delMes === 10 && estado.restantes === 10, estado);

    // ── Las de la prueba no se cuentan en el mes ─────────────────────────
    await yaPostulo(nueva, 3, true);
    await yaPostulo(nueva, 2);
    estado = await obtenerEstadoPostulaciones(nueva.user.id);
    check("3 de la prueba y 2 normales: quedan 8 del mes", estado.delMes === 8, estado);

    // ── Con el mes gastado a mano, la prueba sigue ───────────────────────
    const gastada = await cuentaGratis();
    await yaPostulo(gastada, 10);
    estado = await obtenerEstadoPostulaciones(gastada.user.id);
    check("con 10 normales, el mes queda en cero", estado.delMes === 0 && !estado.permitido, estado);

    let r = await puedePostular(gastada);
    check("a mano y sin cupo: puede-postular dice 'limite'", r.permitido === false && r.motivo === "limite", r);
    r = await puedePostular(gastada, "rafaga");
    check("en una ráfaga de la prueba: puede-postular deja pasar", r.permitido === true && r.motivo === null, r);

    const auto = await estadoAutomatico(gastada);
    check("la búsqueda automática sigue para la prueba, sin motivo para no correr", auto.busquedaAutomatica === true && auto.motivo === null && auto.modo === "prueba", auto);

    let p = await postular(gastada);
    check("a mano y sin cupo: /api/applications responde 403", p.status === 403, p);

    p = await postular(gastada, { desdeRafaga: true });
    check("desde la ráfaga: se guarda y gasta una de la prueba", p.status === 200 && p.cuerpo.prueba?.restantes === PRUEBA_TOTAL - 1, p);
    const guardada = p.cuerpo.id
      ? await prisma.application.findUnique({ where: { id: p.cuerpo.id }, select: { esDePrueba: true } })
      : null;
    check("...queda marcada como de prueba", guardada?.esDePrueba === true, guardada);
    estado = await obtenerEstadoPostulaciones(gastada.user.id);
    check("...y el mes sigue en cero", estado.delMes === 0, estado);

    // ── Las extra no se gastan en la prueba ──────────────────────────────
    await anotarExtra({ userId: gastada.user.id, cantidad: 3, motivo: "COMPRA", clave: `compra:${gastada.user.id}` });
    p = await postular(gastada, { desdeRafaga: true });
    let saldo = await saldoExtras(gastada.user.id);
    check("con extra disponibles, una de la prueba no gasta extra", p.status === 200 && !!p.cuerpo.prueba && saldo === 3, { p, saldo });
    p = await postular(gastada);
    saldo = await saldoExtras(gastada.user.id);
    check("una a mano, sin cupo del mes, sí gasta una extra", p.status === 200 && saldo === 2, { p, saldo });

    // Una que quedó INCOMPLETA en la ráfaga se registra (para el historial) y no gasta nada.
    const antes = (await prisma.user.findUnique({ where: { id: gastada.user.id }, select: { pruebaAutomaticaRestantes: true } }))!.pruebaAutomaticaRestantes;
    p = await postular(gastada, { desdeRafaga: true, incompleta: true, nota: "No se pudo completar" });
    const despues = (await prisma.user.findUnique({ where: { id: gastada.user.id }, select: { pruebaAutomaticaRestantes: true } }))!.pruebaAutomaticaRestantes;
    saldo = await saldoExtras(gastada.user.id);
    check("una incompleta de la ráfaga, sin cupo del mes, queda registrada sin gastar prueba ni extra", p.status === 200 && !p.cuerpo.prueba && despues === antes && saldo === 2, { p, antes, despues, saldo });

    // ── Cuando la prueba se acaba ────────────────────────────────────────
    await prisma.user.update({ where: { id: gastada.user.id }, data: { pruebaAutomaticaRestantes: 0 } });
    r = await puedePostular(gastada, "rafaga");
    check("con la prueba gastada, la ráfaga se corta: 'prueba_terminada'", r.permitido === false && r.motivo === "prueba_terminada", r);
    p = await postular(gastada, { desdeRafaga: true });
    saldo = await saldoExtras(gastada.user.id);
    check("y si igual llega una de ráfaga, cuenta como normal (gasta extra)", p.status === 200 && !p.cuerpo.prueba && saldo === 1, { p, saldo });
  } finally {
    const usuarios = await prisma.user.findMany({ where: { email: { startsWith: PREFIJO } }, select: { id: true } });
    const ids = usuarios.map((u) => u.id);
    // Las postulaciones, cuentas de portal, CV y movimientos se van con la cuenta (Cascade).
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.jobOffer.deleteMany({ where: { externalId: { startsWith: PREFIJO } } });
  }

  console.log(fallos ? `\n${fallos} verificaciones fallaron` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
