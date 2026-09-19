// Verificación del recordatorio por correo (docs/rafagas-y-ponerse-al-dia.md §3.8).
// Las partes puras (elegibilidad, firma del enlace de baja, contenido del correo) no
// necesitan nada; la corrida completa usa el Postgres local con un envío SIMULADO
// (no manda ningún correo). Es para correr a mano:
//   npx tsx --env-file=.env scripts/verificar-recordatorio-rafaga.ts
import { prisma } from "../lib/prisma";
import { armarCorreoRecordatorioRafaga, type DatosRecordatorioRafaga } from "../lib/correo";
import { cambiarRecordatorios, firmarBaja, urlBajaRecordatorios, urlBajaUnClic, verificarBaja } from "../lib/baja-recordatorios";
import {
  DIAS_MAXIMOS_SIN_ACTIVIDAD,
  MAXIMO_POR_CORRIDA,
  decidirRecordatorio,
  ejecutarRecordatorios,
  type PerfilRecordatorio,
} from "../lib/recordatorio-rafaga";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else console.log("✓ " + desc);
}

const HORA = 3_600_000;
const ahora = new Date("2026-09-19T15:00:00Z");
const hace = (horas: number) => new Date(ahora.getTime() - horas * HORA);

// ── La firma del enlace de baja ──────────────────────────────────────────
console.log("\n# firma del enlace de baja");
const secretoOriginal = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "secreto-de-prueba-para-el-test";
const tok = firmarBaja("usuario-1");
check("la firma es estable para la misma persona", firmarBaja("usuario-1") === tok);
check("...y distinta para otra", firmarBaja("usuario-2") !== tok);
check("una firma válida se acepta", verificarBaja("usuario-1", tok));
check("la firma de OTRA persona no sirve (no se puede dar de baja a un tercero)", !verificarBaja("usuario-2", tok));
check("una firma alterada se rechaza", !verificarBaja("usuario-1", tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A")));
check("una firma de otro largo se rechaza sin reventar", !verificarBaja("usuario-1", tok + "x") && !verificarBaja("usuario-1", "corta"));
check("sin firma o sin persona, no", !verificarBaja("usuario-1", null) && !verificarBaja("usuario-1", "") && !verificarBaja("", tok) && !verificarBaja("usuario-1", undefined));
check("con OTRO secreto la firma cambia (un secreto rotado invalida los enlaces viejos, no los deja abiertos)", (() => {
  process.env.AUTH_SECRET = "otro-secreto";
  const otra = firmarBaja("usuario-1");
  process.env.AUTH_SECRET = "secreto-de-prueba-para-el-test";
  return otra !== tok && !verificarBaja("usuario-1", otra);
})());
const enlace = urlBajaRecordatorios("usuario-1");
const unClic = urlBajaUnClic("usuario-1");
check("el enlace de la página trae la persona y la firma", enlace.includes("/recordatorios/baja?") && enlace.includes("u=usuario-1") && enlace.includes("t=" + encodeURIComponent(tok)), enlace);
check("el de un clic apunta a la API, con la misma firma", unClic.includes("/api/recordatorios/baja?") && unClic.includes("t=" + encodeURIComponent(tok)), unClic);
check("los dos son absolutos (un correo no tiene una página a la que ser relativo)", /^https?:\/\//.test(enlace) && /^https?:\/\//.test(unClic));
delete process.env.AUTH_SECRET;
delete process.env.NEXTAUTH_SECRET;
let revento = false;
try { firmarBaja("usuario-1"); } catch { revento = true; }
check("sin secreto NO se firma (un correo sin baja no debe salir)", revento);
check("...y verificar responde que no, sin reventar", !verificarBaja("usuario-1", tok));
process.env.AUTH_SECRET = "secreto-de-prueba-para-el-test";

// ── Quién recibe el recordatorio (§3.8) ──────────────────────────────────
console.log("\n# elegibilidad");
const base: PerfilRecordatorio = {
  premium: true, busquedaAutomaticaActiva: true, extensionConectada: true, emailVerificado: hace(1000),
  recordatoriosActivos: true, ultimaRafagaEn: hace(50), extensionConectadaEn: hace(500), recordatorioRafagaEn: null,
};
const dec = (cambios: Partial<PerfilRecordatorio>, cuando = ahora) => decidirRecordatorio({ ...base, ...cambios }, cuando);
let d = dec({});
check("Premium, conectada, verificada, 50 h sin ponerse al día: se recuerda", d.enviar === true && Math.round((d as any).horasSinPonerse) === 50 && (d as any).nunca === false, d);
check("47 h todavía no", dec({ ultimaRafagaEn: hace(47) }).enviar === false && (dec({ ultimaRafagaEn: hace(47) }) as any).motivo === "reciente");
check("a las 48 h justas, sí (el límite es de hace 48 h O MÁS)", dec({ ultimaRafagaEn: hace(48) }).enviar === true);
check("recién puesta al día: no", (dec({ ultimaRafagaEn: hace(1) }) as any).motivo === "reciente");
check("una hora en el futuro (reloj raro): no", dec({ ultimaRafagaEn: new Date(ahora.getTime() + HORA) }).enviar === false);
check("a los 14 días justos, todavía; pasados, ya no se insiste", dec({ ultimaRafagaEn: hace(DIAS_MAXIMOS_SIN_ACTIVIDAD * 24) }).enviar === true && (dec({ ultimaRafagaEn: hace(DIAS_MAXIMOS_SIN_ACTIVIDAD * 24 + 1) }) as any).motivo === "abandonada");
check("un recordatorio de hace 71 h todavía cuenta: no se manda otro", (dec({ recordatorioRafagaEn: hace(71) }) as any).motivo === "ya_recordado");
check("a las 72 h justas, sí", dec({ recordatorioRafagaEn: hace(72) }).enviar === true);
check("recordatorio de una racha anterior (hace 30 días): no impide el de ahora", dec({ recordatorioRafagaEn: hace(720) }).enviar === true);
check("se dio de baja: no (y gana sobre todo lo demás)", (dec({ recordatoriosActivos: false, premium: false }) as any).motivo === "sin_recordatorios");
check("cuenta gratis: no (el único aviso que recibe es el de fin de prueba, §4.1)", (dec({ premium: false }) as any).motivo === "no_premium");
check("búsqueda automática en pausa: no (pausó, no se olvidó)", (dec({ busquedaAutomaticaActiva: false }) as any).motivo === "pausada");
check("extensión sin conectar: no", (dec({ extensionConectada: false }) as any).motivo === "sin_extension");
check("correo sin verificar: no", (dec({ emailVerificado: null }) as any).motivo === "sin_correo_verificado");
d = dec({ ultimaRafagaEn: null, extensionConectadaEn: hace(60) });
check('nunca se puso al día y la extensión se conectó hace 60 h: se recuerda, y lo dice ("nunca")', d.enviar === true && (d as any).nunca === true, d);
check("...pero conectada hace 10 h todavía no", (dec({ ultimaRafagaEn: null, extensionConectadaEn: hace(10) }) as any).motivo === "reciente");
check("cuenta conectada antes de que existiera la fecha (no se sabe desde cuándo): no se inventa un \"hace 2 días\"", (dec({ ultimaRafagaEn: null, extensionConectadaEn: null }) as any).motivo === "sin_referencia");
check("con una puesta al día reciente manda ella, no la fecha de conexión vieja", (dec({ ultimaRafagaEn: hace(5), extensionConectadaEn: hace(900) }) as any).motivo === "reciente");

// ── El correo ────────────────────────────────────────────────────────────
console.log("\n# contenido del correo");
const datos = (c: Partial<DatosRecordatorioRafaga> = {}): DatosRecordatorioRafaga => ({ dias: 2, aprobadas: 0, urlBaja: "https://app.test/recordatorios/baja?u=1&t=2", urlBajaUnClic: "https://app.test/api/recordatorios/baja?u=1&t=2", ...c });
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
let c = armarCorreoRecordatorioRafaga(datos());
check('asunto del documento: "AutoPostula no se pone al día hace 2 días"', c.subject === "AutoPostula no se pone al día hace 2 días", c.subject);
check('cuerpo: "Abre Chrome en tu computador unos minutos y se pone al día solo."', texto(c.html).includes("Abre Chrome en tu computador unos minutos y se pone al día solo."));
check("sin aprobadas pendientes no menciona ninguna", !texto(c.html).includes("aprobaste"));
check('el enlace de baja dice "Dejar de recibir estos avisos" y lleva a la página firmada (con el & escapado en el HTML)', /<a href="https:\/\/app\.test\/recordatorios\/baja\?u=1&amp;t=2"[^>]*>\s*Dejar de recibir estos avisos\s*<\/a>/.test(c.html), c.html);
check("trae List-Unsubscribe (Gmail y Outlook muestran \"Cancelar suscripción\") con el enlace de un clic", c.headers["List-Unsubscribe"] === "<https://app.test/api/recordatorios/baja?u=1&t=2>" && c.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", c.headers);
c = armarCorreoRecordatorioRafaga(datos({ dias: 5, aprobadas: 3 }));
check('con 3 aprobadas: "Tienes 3 ofertas que aprobaste esperando para enviarse."', c.subject === "AutoPostula no se pone al día hace 5 días" && texto(c.html).includes("Tienes 3 ofertas que aprobaste esperando para enviarse."), texto(c.html));
c = armarCorreoRecordatorioRafaga(datos({ aprobadas: 1 }));
check('singular: "Tienes 1 oferta que aprobaste esperando para enviarse."', texto(c.html).includes("Tienes 1 oferta que aprobaste esperando para enviarse."), texto(c.html));
c = armarCorreoRecordatorioRafaga(datos({ dias: null }));
check('quien nunca se puso al día: "AutoPostula todavía no se pone al día" (no dice "hace N días")', c.subject === "AutoPostula todavía no se pone al día" && !/hace \d+ días/.test(c.subject + texto(c.html)), c.subject);
check('honesto: NO dice "ofertas nuevas que calzan contigo" (el puntaje no existe del lado del servidor)', ![datos({ aprobadas: 3 }), datos({ dias: null })].some((x) => /nuevas|calzan|encontr/i.test(texto(armarCorreoRecordatorioRafaga(x).html))));

// ── La corrida completa contra Postgres ──────────────────────────────────
console.log("\n# corrida contra Postgres (envío simulado)");
type Enviado = { email: string; datos: DatosRecordatorioRafaga };
const P = "zz-rec-";

async function limpiar() {
  await prisma.subscription.deleteMany({ where: { userId: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: P } } });
}

async function main() {
  await limpiar();
  const plan = await prisma.plan.findFirst({ where: { tipo: "PREMIUM" } });
  if (!plan) throw new Error("No hay un plan PREMIUM en la base local para sembrar");
  const vigente = { periodoInicio: hace(24 * 10), periodoFin: new Date(Date.now() + 24 * 20 * HORA) };

  // Las fechas son relativas a AHORA (Date.now): ejecutarRecordatorios usa el reloj real.
  const reloj = Date.now();
  const antes = (horas: number) => new Date(reloj - horas * HORA);
  const perfil = (id: string, extra: Record<string, unknown> = {}) => ({
    id: P + id, email: `${P}${id}@example.test`, emailVerificado: antes(1000), extensionConectada: true,
    busquedaAutomaticaActiva: true, recordatoriosActivos: true, extensionConectadaEn: antes(500), ultimaRafagaEn: antes(50), ...extra,
  });
  const usuarios = [
    perfil("a-elegible"),
    perfil("b-con-aprobadas"),
    perfil("c-gratis"),
    perfil("d-de-baja", { recordatoriosActivos: false }),
    perfil("e-reciente", { ultimaRafagaEn: antes(10) }),
    perfil("f-ya-recordado", { recordatorioRafagaEn: antes(24) }),
    perfil("g-nunca-corrio", { ultimaRafagaEn: null, extensionConectadaEn: antes(60) }),
    perfil("h-sin-fecha-de-conexion", { ultimaRafagaEn: null, extensionConectadaEn: null }),
    perfil("i-pausada", { busquedaAutomaticaActiva: false }),
    perfil("j-sin-verificar", { emailVerificado: null }),
    perfil("k-sin-extension", { extensionConectada: false }),
    perfil("l-admin", { rol: "ADMIN" }),
    perfil("m-abandonada", { ultimaRafagaEn: antes(24 * 20) }),
    perfil("n-pase-vencido"),
  ];
  await prisma.user.createMany({ data: usuarios as any });
  const premium = ["a-elegible", "b-con-aprobadas", "d-de-baja", "e-reciente", "f-ya-recordado", "g-nunca-corrio", "h-sin-fecha-de-conexion", "i-pausada", "j-sin-verificar", "k-sin-extension", "m-abandonada"];
  for (const id of premium) {
    await prisma.subscription.create({ data: { userId: P + id, planId: plan.id, estado: "ACTIVA", ...vigente } });
  }
  // Un pase que YA venció (la cuenta volvió al plan gratis) y todavía dice ACTIVA: el acceso se decide por fecha.
  await prisma.subscription.create({ data: { userId: P + "n-pase-vencido", planId: plan.id, estado: "ACTIVA", periodoInicio: hace(24 * 40), periodoFin: hace(24 * 10) } });
  // b tiene 3 aprobadas que se pueden enviar, una sin URL (no se puede enviar) y una que dijo que NO.
  const aprobada = (extra: Record<string, unknown>) => ({ userId: P + "b-con-aprobadas", fuente: "BANDA_GRIS" as const, tituloCrudo: "Oferta", veredicto: "SI" as const, url: "https://x/o", plataforma: "Computrabajo", ...extra });
  await prisma.decisionOferta.createMany({
    data: [aprobada({}), aprobada({}), aprobada({}), aprobada({ url: null }), aprobada({ veredicto: "NO" }), aprobada({ fuente: "TRIAJE_ONBOARDING" })],
  });

  const enviados: Enviado[] = [];
  const simulado = async (email: string, datos: DatosRecordatorioRafaga) => { enviados.push({ email, datos }); };
  const quienes = () => enviados.map((e) => e.email.replace(P, "").replace("@example.test", "")).sort();
  const marca = async (id: string) => (await prisma.user.findUnique({ where: { id: P + id }, select: { recordatorioRafagaEn: true } }))?.recordatorioRafagaEn ?? null;

  let r = await ejecutarRecordatorios({ enviar: simulado });
  check("recibe el recordatorio solo quien corresponde: a, b, g (nunca corrió) y l (admin)", JSON.stringify(quienes()) === JSON.stringify(["a-elegible", "b-con-aprobadas", "g-nunca-corrio", "l-admin"]), quienes());
  check("...y quedan anotados como recordados", (await Promise.all(["a-elegible", "b-con-aprobadas", "g-nunca-corrio", "l-admin"].map(marca))).every((m) => m !== null));
  check("...y a nadie más se le anota nada", (await Promise.all(["c-gratis", "d-de-baja", "e-reciente", "i-pausada", "j-sin-verificar", "k-sin-extension", "m-abandonada", "n-pase-vencido", "h-sin-fecha-de-conexion"].map(marca))).every((m) => m === null));
  const de = (id: string) => enviados.find((e) => e.email.startsWith(P + id))!;
  check("a: 50 h sin ponerse al día = 2 días", de("a-elegible").datos.dias === 2 && de("a-elegible").datos.aprobadas === 0, de("a-elegible").datos);
  check("b: cuenta solo las aprobadas que se pueden enviar (3 de 6: sin URL, con NO y del triaje no)", de("b-con-aprobadas").datos.aprobadas === 3, de("b-con-aprobadas").datos);
  check('g: nunca se puso al día -> dias = null ("todavía no se pone al día")', de("g-nunca-corrio").datos.dias === null, de("g-nunca-corrio").datos);
  check("cada correo trae SU enlace de baja firmado (y solo el suyo)", enviados.every((e) => { const u = e.email.replace("@example.test", ""); return e.datos.urlBaja.includes("u=" + u) && verificarBaja(u, new URL(e.datos.urlBaja).searchParams.get("t")); }));
  check("una cuenta con el pase vencido (ya es gratis aunque diga ACTIVA) no recibe nada", !quienes().includes("n-pase-vencido"));
  check("el resultado cuenta 4 enviados, 0 fallidos, 0 diferidos", r.enviados === 4 && r.fallidos === 0 && r.diferidos === 0, r);

  // ── No se repite antes de 72 h ──
  enviados.length = 0;
  r = await ejecutarRecordatorios({ enviar: simulado });
  check("corrida inmediata: no manda nada (no llega otro antes de 72 h)", enviados.length === 0 && r.enviados === 0, quienes());
  check("...y dice por qué: los 5 ya recordados", (r.omitidos.ya_recordado ?? 0) === 5, r.omitidos);

  // 73 h después (todavía dentro de los 14 días): vuelve a salir.
  r = await ejecutarRecordatorios({ enviar: simulado, ahora: new Date(reloj + 73 * HORA) });
  check(
    "73 h después vuelve a salir a los 4, y se suman e (ya lleva 83 h sin ponerse al día) y f (su recordatorio de hace 24 h ya cumplió 72 h)",
    JSON.stringify(quienes()) === JSON.stringify(["a-elegible", "b-con-aprobadas", "e-reciente", "f-ya-recordado", "g-nunca-corrio", "l-admin"]),
    quienes(),
  );
  check("...y cuenta los días de verdad: a lleva 123 h = 5 días", enviados.find((e) => e.email.startsWith(P + "a-elegible"))!.datos.dias === 5);

  // ── Un envío que falla no se anota: mañana se reintenta ──
  await prisma.user.updateMany({ where: { id: { startsWith: P } }, data: { recordatorioRafagaEn: null } });
  enviados.length = 0;
  const fallaB = async (email: string, datos: DatosRecordatorioRafaga) => { if (email.startsWith(P + "b-")) throw new Error("Resend rechazó el correo"); await simulado(email, datos); };
  const errorOriginal = console.error;
  console.error = () => {};
  r = await ejecutarRecordatorios({ enviar: fallaB });
  console.error = errorOriginal;
  check("si el envío a b falla, los demás salen igual (a, f, g, l) y se cuenta 1 fallido", r.fallidos === 1 && r.enviados === 4 && !quienes().includes("b-con-aprobadas"), { r, quienes: quienes() });
  check("...b NO queda anotado como recordado (no se le dio por avisado un correo que no salió)", (await marca("b-con-aprobadas")) === null && (await marca("a-elegible")) !== null);
  enviados.length = 0;
  r = await ejecutarRecordatorios({ enviar: simulado });
  check("...y en la corrida siguiente se le reintenta solo a b", JSON.stringify(quienes()) === JSON.stringify(["b-con-aprobadas"]), quienes());

  // ── Darse de baja lo detiene ──
  await prisma.user.updateMany({ where: { id: { startsWith: P } }, data: { recordatorioRafagaEn: null } });
  const tokA = firmarBaja(P + "a-elegible");
  check("baja con una firma mala: no cambia nada", (await cambiarRecordatorios(P + "a-elegible", "mala", false)) === "invalido" && (await prisma.user.findUnique({ where: { id: P + "a-elegible" } }))!.recordatoriosActivos === true);
  check("baja con la firma de OTRA persona: no cambia nada", (await cambiarRecordatorios(P + "a-elegible", firmarBaja(P + "b-con-aprobadas"), false)) === "invalido" && (await prisma.user.findUnique({ where: { id: P + "a-elegible" } }))!.recordatoriosActivos === true);
  check("baja con su firma: queda sin recordatorios", (await cambiarRecordatorios(P + "a-elegible", tokA, false)) === "ok" && (await prisma.user.findUnique({ where: { id: P + "a-elegible" } }))!.recordatoriosActivos === false);
  enviados.length = 0;
  await ejecutarRecordatorios({ enviar: simulado });
  check("...y en la corrida siguiente a a ya no le llega (criterio 9 de §8), y sí a los otros cuatro", !quienes().includes("a-elegible") && JSON.stringify(quienes()) === JSON.stringify(["b-con-aprobadas", "f-ya-recordado", "g-nunca-corrio", "l-admin"]), quienes());
  check("con la misma firma puede volver a activarlos (por si el clic fue sin querer)", (await cambiarRecordatorios(P + "a-elegible", tokA, true)) === "ok" && (await prisma.user.findUnique({ where: { id: P + "a-elegible" } }))!.recordatoriosActivos === true);
  check("una firma válida de una cuenta que ya no existe no revienta", (await cambiarRecordatorios(P + "no-existe", firmarBaja(P + "no-existe"), false)) === "ok");

  // ── El tope por corrida ──
  await limpiar();
  const muchos = MAXIMO_POR_CORRIDA + 5;
  await prisma.user.createMany({
    data: Array.from({ length: muchos }, (_, i) => perfil("masivo-" + String(i).padStart(3, "0"), { ultimaRafagaEn: antes(50 + i * 0.01) })) as any,
  });
  await prisma.subscription.createMany({ data: Array.from({ length: muchos }, (_, i) => ({ userId: P + "masivo-" + String(i).padStart(3, "0"), planId: plan.id, estado: "ACTIVA" as const, ...vigente })) });
  enviados.length = 0;
  r = await ejecutarRecordatorios({ enviar: simulado });
  check(`con ${muchos} elegibles, una corrida manda ${MAXIMO_POR_CORRIDA} y deja 5 diferidos`, r.enviados === MAXIMO_POR_CORRIDA && r.diferidos === 5 && enviados.length === MAXIMO_POR_CORRIDA, r);
  enviados.length = 0;
  r = await ejecutarRecordatorios({ enviar: simulado });
  check("la corrida siguiente termina con los 5 que quedaron (nadie se pierde ni se repite)", r.enviados === 5 && r.diferidos === 0 && enviados.length === 5, r);
}

main()
  .catch((e) => { fallos++; console.error("✗ la corrida contra Postgres lanzó una excepción:", e); })
  .finally(async () => {
    await limpiar().catch(() => {});
    if (secretoOriginal) process.env.AUTH_SECRET = secretoOriginal;
    await prisma.$disconnect();
    console.log("\n" + (fallos === 0 ? "✓ Todo OK" : "✗ " + fallos + " fallo(s)"));
    process.exit(fallos === 0 ? 0 : 1);
  });
