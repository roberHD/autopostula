// Verificación de docs/aprobadas-y-portal-desconectado-2026-11-03.md, contra una
// base de PRUEBA:
//
//   DATABASE_URL=postgresql://.../una_base_test npx tsx scripts/verificar-aprobadas-portal.ts
//
// Se niega a correr si el nombre de la base no dice "test": crea y borra cuentas
// y decisiones. Llama a las rutas de verdad que usa la extensión
// (/api/extension/perfil y /api/extension/banda-gris) con un token, y a la lista
// de «Por decidir» que arma la página.
import { prisma } from "../lib/prisma";
import { hashToken } from "../lib/token";
import { claveDeOferta, esLaMismaOferta, filtroMismaOferta } from "../lib/misma-oferta";
import { esperandoEnPortalesDesconectados } from "../lib/aprobadas-por-enviar";
import { listarPorDecidir } from "../lib/panel/listas";
import { GET as rutaPerfil } from "../app/api/extension/perfil/route";
import { POST as rutaBandaGris } from "../app/api/extension/banda-gris/route";

const url = process.env.DATABASE_URL ?? "";
if (!/test/i.test(url.split("?")[0].split("/").pop() ?? "")) {
  console.error("Se niega a correr: DATABASE_URL tiene que apuntar a una base cuyo nombre incluya 'test'.");
  process.exit(2);
}

const PREFIJO = "verificar-aprobadas-portal-";
const HORA = 3_600_000;

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else console.log("✓ " + desc);
}

const unico = () => `${PREFIJO}${crypto.randomUUID()}`;
const hace = (horas: number) => new Date(Date.now() - horas * HORA);

const tj = (id: number, busqueda = "vendedor") =>
  `https://www.trabajando.cl/trabajo-empleo/${busqueda}/trabajo/${id}-vendedor-a-temporada-verano`;
const lb = (id: number) => `https://www.laborum.cl/empleos/vendedor-a-de-tienda-${id}.html`;
const HEX = "0123456789ABCDEF0123456789ABCDEF";

const URL_BASE: Record<string, string> = {
  Computrabajo: "https://cl.computrabajo.com",
  Laborum: "https://www.laborum.cl",
  Trabajando: "https://www.trabajando.cl",
};

async function portal(nombre: string) {
  return prisma.jobPlatform.upsert({
    where: { nombre },
    update: {},
    create: { nombre, urlBase: URL_BASE[nombre], adapterVersion: "prueba" },
  });
}

async function cuenta(portales: { conectados?: string[]; desconectados?: string[] } = {}) {
  const token = unico();
  const user = await prisma.user.create({ data: { email: `${unico()}@prueba.test`, apiToken: hashToken(token) } });
  for (const [nombres, activa] of [[portales.conectados ?? [], true], [portales.desconectados ?? [], false]] as const) {
    for (const nombre of nombres) {
      const p = await portal(nombre);
      await prisma.platformAccount.create({ data: { userId: user.id, platformId: p.id, activa } });
    }
  }
  return { user, token };
}

type Cuenta = Awaited<ReturnType<typeof cuenta>>;

async function decision(c: Cuenta, datos: Record<string, unknown>) {
  return prisma.decisionOferta.create({
    data: {
      userId: c.user.id,
      tituloCrudo: "Vendedor(a) de prueba",
      fuente: "BANDA_GRIS",
      veredicto: "SI",
      ...datos,
    } as any,
  });
}

async function pedirPerfil(c: Cuenta) {
  const res = await rutaPerfil(new Request("http://localhost/api/extension/perfil", { headers: { authorization: `Bearer ${c.token}` } }));
  const data = await res.json();
  return (data.bandaGrisAprobadas ?? []) as { id: string; titulo: string; url: string; plataforma: string }[];
}

async function reportarGris(c: Cuenta, urlOferta: string, plataforma: string) {
  const res = await rutaBandaGris(
    new Request("http://localhost/api/extension/banda-gris", {
      method: "POST",
      headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
      body: JSON.stringify({ titulo: "Vendedor(a) de prueba", url: urlOferta, plataforma, scoreLocal: 50, razones: [] }),
    })
  );
  return (await res.json()) as { ok?: boolean; yaExistia?: boolean };
}

const pendientesDe = (c: Cuenta) =>
  prisma.decisionOferta.count({ where: { userId: c.user.id, fuente: "BANDA_GRIS", veredicto: "PENDIENTE" } });

async function main() {
  // ── 1. La misma oferta con otro enlace ────────────────────────────────────
  console.log("\n# la misma oferta, aunque cambie el enlace");
  check("Trabajando: el número del aviso es la clave", claveDeOferta(tj(6141491), "Trabajando") === "Trabajando:6141491", claveDeOferta(tj(6141491), "Trabajando"));
  check(
    "Trabajando: la misma oferta buscada como «vendedor» y como «asistente de ventas» es la misma",
    esLaMismaOferta({ url: tj(6141491), plataforma: "Trabajando" }, { url: tj(6141491, "asistente-de-ventas"), plataforma: "Trabajando" })
  );
  check(
    "Trabajando: el aviso suelto (/trabajo/ID--…) da la misma clave",
    claveDeOferta("https://www.trabajando.cl/trabajo/6138557--asistente-de-ventas-allsaints", "Trabajando") === "Trabajando:6138557"
  );
  check(
    "Trabajando: 6138557 y 61385570 no son la misma",
    !esLaMismaOferta({ url: tj(6138557), plataforma: "Trabajando" }, { url: tj(61385570), plataforma: "Trabajando" })
  );
  check(
    "Laborum: el mismo aviso con y sin parámetros es el mismo",
    esLaMismaOferta({ url: lb(1117654321), plataforma: "Laborum" }, { url: lb(1117654321) + "?origen=listado", plataforma: "Laborum" })
  );
  check(
    "Computrabajo: el aviso en el panel de un listado (#ID) y en su página (…-id) es el mismo",
    esLaMismaOferta(
      { url: `https://cl.computrabajo.com/trabajo-de-vendedor#${HEX}`, plataforma: "Computrabajo" },
      { url: `https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-vendedor-en-las-condes-${HEX.toLowerCase()}`, plataforma: "Computrabajo" }
    )
  );
  check(
    "Computrabajo: un trozo del nombre que parece hexadecimal no es un ID",
    claveDeOferta("https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-barista-cafe1234", "Computrabajo") === null
  );
  check("el número de Trabajando no sirve como aviso de Laborum", claveDeOferta(tj(1), "Laborum") === null);
  check(
    "sin número reconocible, el mismo enlace sigue siendo la misma oferta (y otro enlace, no)",
    esLaMismaOferta({ url: "https://x/o", plataforma: "Otro" }, { url: "https://x/o", plataforma: "Otro" }) &&
      !esLaMismaOferta({ url: "https://x/o", plataforma: "Otro" }, { url: "https://x/p", plataforma: "Otro" })
  );
  check("sin número reconocible, se busca por el enlace entero", JSON.stringify(filtroMismaOferta("https://x/o", "Otro")) === JSON.stringify({ url: "https://x/o" }));

  // ── 2. Lo que la extensión intenta enviar ────────────────────────────────
  console.log("\n# /api/extension/perfil: solo aprobadas de portales conectados");
  const a = await cuenta({ conectados: ["Laborum"], desconectados: ["Trabajando"] });
  for (let i = 1; i <= 6; i++) {
    await decision(a, { url: tj(6140000 + i), plataforma: "Trabajando", decididoEn: hace(i) });
  }
  await decision(a, { url: lb(1001), plataforma: "Laborum", decididoEn: hace(10), tituloCrudo: "Laborum 1001" });
  await decision(a, { url: lb(1002), plataforma: "Laborum", decididoEn: hace(11), fuente: "PANEL_REVISION", tituloCrudo: "Laborum 1002" });
  await decision(a, { url: lb(1001), plataforma: "Laborum", decididoEn: hace(12), tituloCrudo: "Laborum 1001 (otra vez)" });
  await decision(a, { url: lb(1003), plataforma: "Laborum", decididoEn: hace(24 * 20), tituloCrudo: "Laborum vieja" });
  await decision(a, { url: lb(1004), plataforma: "Laborum", decididoEn: hace(1), veredicto: "NO" });

  let aprobadas = await pedirPerfil(a);
  check(
    "con Trabajando desconectado, la extensión no recibe ninguna de sus 6 aprobadas (aunque son las más recientes)",
    aprobadas.every((x) => x.plataforma === "Laborum"),
    aprobadas.map((x) => x.plataforma)
  );
  check(
    "...y sí las 2 de Laborum, que antes quedaban fuera de los 5 cupos",
    aprobadas.length === 2 && aprobadas.some((x) => x.url === lb(1001)) && aprobadas.some((x) => x.url === lb(1002)),
    aprobadas.map((x) => x.titulo)
  );
  check(
    "una oferta aprobada dos veces ocupa un cupo, el de su «sí» más reciente",
    aprobadas.filter((x) => x.url === lb(1001)).length === 1 && aprobadas.some((x) => x.titulo === "Laborum 1001"),
    aprobadas.map((x) => x.titulo)
  );
  check("una aprobada de hace 20 días ya no se intenta", !aprobadas.some((x) => x.url === lb(1003)));

  await prisma.platformAccount.updateMany({ where: { userId: a.user.id }, data: { activa: false } });
  const trabajando = await portal("Trabajando");
  await prisma.platformAccount.updateMany({ where: { userId: a.user.id, platformId: trabajando.id }, data: { activa: true } });
  aprobadas = await pedirPerfil(a);
  check(
    "al volver a conectar Trabajando (y desconectar Laborum), salen sus 5 aprobadas más recientes",
    aprobadas.length === 5 && aprobadas.every((x) => x.plataforma === "Trabajando") && aprobadas[0].url === tj(6140001),
    aprobadas.map((x) => x.url)
  );

  const sinPortales = await cuenta();
  await decision(sinPortales, { url: tj(6150001), plataforma: "Trabajando", decididoEn: hace(1) });
  check("sin ningún portal conectado no recibe ninguna", (await pedirPerfil(sinPortales)).length === 0);

  // ── 3. «Por decidir» no repite lo decidido ───────────────────────────────
  console.log("\n# /api/extension/banda-gris: no vuelve a preguntar por una oferta decidida");
  const b = await cuenta({ conectados: ["Trabajando"] });
  let r = await reportarGris(b, tj(6160001), "Trabajando");
  check("una oferta nueva entra a «Por decidir»", r.ok === true && !r.yaExistia && (await pendientesDe(b)) === 1, r);
  r = await reportarGris(b, tj(6160001), "Trabajando");
  check("la misma, todavía pendiente, no se repite (como antes)", r.yaExistia === true && (await pendientesDe(b)) === 1, r);

  await prisma.decisionOferta.updateMany({ where: { userId: b.user.id, url: tj(6160001) }, data: { veredicto: "SI", decididoEn: new Date() } });
  r = await reportarGris(b, tj(6160001), "Trabajando");
  check("ya aprobada, el escaneo siguiente NO la vuelve a poner en «Por decidir»", r.yaExistia === true && (await pendientesDe(b)) === 0, r);
  r = await reportarGris(b, tj(6160001, "asistente-de-ventas"), "Trabajando");
  check("...tampoco si llega con el enlace de otra búsqueda", r.yaExistia === true && (await pendientesDe(b)) === 0, r);

  await decision(b, { url: tj(6160002), plataforma: "Trabajando", veredicto: "NO", decididoEn: hace(2) });
  r = await reportarGris(b, tj(6160002), "Trabajando");
  check("una que dijo que no, no vuelve", r.yaExistia === true && (await pendientesDe(b)) === 0, r);

  await decision(b, { url: tj(6160003), plataforma: "Trabajando", fuente: "PANEL_REVISION", decididoEn: hace(2) });
  r = await reportarGris(b, tj(6160003), "Trabajando");
  check("una que aprobó en el panel del portal, no vuelve", r.yaExistia === true && (await pendientesDe(b)) === 0, r);

  await decision(b, { url: tj(6160004), plataforma: "Trabajando", veredicto: "EXPIRADA", decididoEn: hace(30) });
  r = await reportarGris(b, tj(6160004), "Trabajando");
  check("una aprobada que la extensión no pudo enviar (EXPIRADA con fecha de decisión), no vuelve", r.yaExistia === true && (await pendientesDe(b)) === 0, r);

  await decision(b, { url: tj(6160005), plataforma: "Trabajando", veredicto: "EXPIRADA", decididoEn: null, venceEn: hace(24) });
  r = await reportarGris(b, tj(6160005), "Trabajando");
  check("una que venció sin que nadie la decidiera, sí vuelve a preguntarse", !r.yaExistia && (await pendientesDe(b)) === 1, r);

  const otra = await cuenta({ conectados: ["Trabajando"] });
  await decision(otra, { url: tj(6160006), plataforma: "Trabajando", decididoEn: hace(1) });
  r = await reportarGris(b, tj(6160006), "Trabajando");
  check("lo que decidió OTRA cuenta no cuenta", !r.yaExistia && (await pendientesDe(b)) === 2, r);

  await decision(b, { url: tj(6138557), plataforma: "Trabajando", decididoEn: hace(1) });
  r = await reportarGris(b, tj(61385570), "Trabajando");
  check("un aviso con un número más largo es otra oferta", !r.yaExistia && (await pendientesDe(b)) === 3, r);
  // La base solo sabe "contiene": /trabajo/7123456 está dentro de /trabajo/71234560-…
  await decision(b, { url: tj(71234560), plataforma: "Trabajando", decididoEn: hace(1) });
  r = await reportarGris(b, tj(7123456), "Trabajando");
  check("...y uno cuyo número es el comienzo del de otra decidida, también", !r.yaExistia && (await pendientesDe(b)) === 4, r);

  // ── 4. Lo que espera en un portal desconectado ───────────────────────────
  console.log("\n# «Por decidir» y Portales: lo que espera en un portal desconectado");
  const c = await cuenta({ conectados: ["Laborum"], desconectados: ["Trabajando"] });
  const futuro = new Date(Date.now() + 5 * 24 * HORA);
  await decision(c, { url: lb(2001), plataforma: "Laborum", veredicto: "PENDIENTE", venceEn: futuro, tituloCrudo: "Pendiente Laborum" });
  await decision(c, { url: tj(6170001), plataforma: "Trabajando", veredicto: "PENDIENTE", venceEn: futuro, tituloCrudo: "Pendiente Trabajando 1" });
  await decision(c, { url: tj(6170002), plataforma: "Trabajando", veredicto: "PENDIENTE", venceEn: futuro, tituloCrudo: "Pendiente Trabajando 2" });
  await decision(c, { url: tj(6170003), plataforma: "Trabajando", veredicto: "PENDIENTE", venceEn: hace(1), tituloCrudo: "Vencida Trabajando" });
  await decision(c, { url: null, plataforma: null, veredicto: "PENDIENTE", venceEn: futuro, tituloCrudo: "Sin portal" });
  for (let i = 1; i <= 3; i++) await decision(c, { url: tj(6171000 + i), plataforma: "Trabajando", decididoEn: hace(i) });
  await decision(c, { url: tj(6171009), plataforma: "Trabajando", decididoEn: hace(24 * 20) });
  await decision(c, { url: lb(2002), plataforma: "Laborum", decididoEn: hace(1) });
  await decision(c, { url: tj(6171010), plataforma: "Trabajando", decididoEn: hace(1), veredicto: "NO" });
  const oferta = await prisma.jobOffer.create({ data: { platformId: trabajando.id, externalId: unico(), titulo: "Ya enviada" } });
  await decision(c, { url: tj(6171011), plataforma: "Trabajando", decididoEn: hace(1), jobOfferId: oferta.id });

  const esperado = JSON.stringify([{ portal: "Trabajando", aprobadas: 3, pendientes: 2 }]);
  const espera = await esperandoEnPortalesDesconectados(c.user.id);
  check(
    "en Trabajando esperan 3 aprobadas y 2 por decidir (no la de hace 20 días, ni el no, ni la ya enviada, ni la vencida)",
    JSON.stringify(espera) === esperado,
    espera
  );

  const lista = await listarPorDecidir(c.user.id);
  const conectado = (titulo: string) => lista.pendientes.find((p) => p.tituloCrudo === titulo)?.portalConectado;
  check("«Por decidir» trae lo mismo para el aviso de arriba", JSON.stringify(lista.esperandoPortal) === esperado, lista.esperandoPortal);
  check(
    "cada tarjeta sabe si su portal está conectado (Laborum sí, Trabajando no, sin portal no se avisa)",
    conectado("Pendiente Laborum") === true &&
      conectado("Pendiente Trabajando 1") === false &&
      conectado("Pendiente Trabajando 2") === false &&
      conectado("Sin portal") === true,
    lista.pendientes.map((p) => [p.tituloCrudo, p.portalConectado])
  );
  check("la vencida ya no está entre las pendientes", !lista.pendientes.some((p) => p.tituloCrudo === "Vencida Trabajando"));

  const todoConectado = await cuenta({ conectados: ["Laborum", "Trabajando"] });
  await decision(todoConectado, { url: tj(6180001), plataforma: "Trabajando", decididoEn: hace(1) });
  await decision(todoConectado, { url: lb(3001), plataforma: "Laborum", veredicto: "PENDIENTE", venceEn: futuro });
  check("con todo conectado no hay nada que avisar", (await esperandoEnPortalesDesconectados(todoConectado.user.id)).length === 0);
  const sinNingunPortal = await esperandoEnPortalesDesconectados(sinPortales.user.id);
  check(
    "sin ningún portal conectado, lo aprobado en Trabajando también queda esperando",
    JSON.stringify(sinNingunPortal) === JSON.stringify([{ portal: "Trabajando", aprobadas: 1, pendientes: 0 }]),
    sinNingunPortal
  );
  check("una cuenta sin decisiones no tiene nada esperando", (await esperandoEnPortalesDesconectados((await cuenta()).user.id)).length === 0);
}

async function limpiar() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIJO } } });
  await prisma.jobOffer.deleteMany({ where: { externalId: { startsWith: PREFIJO } } });
}

main()
  .catch((e) => {
    fallos++;
    console.error("✗ Error inesperado:", e);
  })
  .finally(async () => {
    await limpiar().catch((e) => console.error("No se pudo limpiar:", e));
    await prisma.$disconnect();
    console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo bien");
    process.exit(fallos ? 1 : 0);
  });
