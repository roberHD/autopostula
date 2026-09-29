// Verificación de docs/revision-2026-09-28.md. La parte pura corre sin nada;
// la de límites de intentos y premios de invitación usa la base, con cuentas
// de mentira que se borran al final:
//   npx tsx scripts/verificar-revision-2026-09-28.ts
//
// Si algo falla a la mitad, las cuentas quedan con el prefijo de abajo y se
// pueden borrar a mano sin tocar nada real.
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { emailCanonico, limpiarUbicacion, normalizarEmail, problemaConPassword, urlDePortal } from "../lib/entrada";
import { datosDeLaOferta } from "../lib/datos-postulacion";
import { diaEnChile, inicioDelDiaChile, inicioDelMesChile, inicioDeOtroDiaChile } from "../lib/tiempo";
import { mayusculaInicial, nombrePropio } from "../lib/text";
import { chequearCv } from "../lib/chequeo-cv";
import { anotarIntento, claveLimite, permitirIntento, superaLimite } from "../lib/limite-tasa";
import { MAXIMO_INVITACIONES_PREMIADAS_POR_MES, premiarInvitacion, saldoExtras } from "../lib/extras";

const PREFIJO = "verificar-revision-";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

// ── §1: solo enlaces https:// de los tres portales ──────────────────────
check("un aviso de Computrabajo pasa", urlDePortal("https://cl.computrabajo.com/ofertas-de-trabajo/x-123", "Computrabajo") !== null);
check("uno de Laborum pasa", urlDePortal("https://www.laborum.cl/empleos/x-1.html", "Laborum") !== null);
check("uno de Trabajando pasa", urlDePortal("https://www.trabajando.cl/trabajo/123", "Trabajando") !== null);
check("una página falsa NO pasa (el caso probado de phishing)", urlDePortal("https://phishing.example/computrabajo-login", "Computrabajo") === null);
check("javascript: NO pasa", urlDePortal("javascript:alert(1)", "Computrabajo") === null);
check("http:// sin cifrar NO pasa", urlDePortal("http://www.laborum.cl/x", "Laborum") === null);
check("un dominio que solo termina parecido NO pasa", urlDePortal("https://computrabajo.cl.evil.com/x", "Computrabajo") === null);
check("usuario@dominio en la URL NO pasa (apunta a otro sitio)", urlDePortal("https://computrabajo.cl@evil.com/x", "Computrabajo") === null);
check("el dominio de OTRO portal no pasa si se sabe el portal", urlDePortal("https://www.laborum.cl/x", "Computrabajo") === null);
check("sin portal conocido, cualquiera de los tres pasa", urlDePortal("https://www.laborum.cl/x", null) !== null);
check("lo que no es texto no pasa", urlDePortal({ href: "https://www.laborum.cl" }, "Laborum") === null);

// Lo que ve cada persona sale de su propia postulación, no de la oferta compartida.
const vista = datosDeLaOferta({
  titulo: "Operario de bodega\nPostulado",
  empresa: "Empresa real",
  url: "https://phishing.example/x",
  jobOffer: { titulo: "otro", platform: { nombre: "Computrabajo" } },
});
check("el título sale de la postulación (y se limpia)", vista.titulo === "Operario de bodega", vista);
check("un enlace guardado antes de validar no se muestra", vista.url === null, vista);
check("la empresa sale de la postulación", vista.empresa === "Empresa real", vista);

// ── §18 y §20: correos y contraseñas ─────────────────────────────────────
check("el correo se guarda en minúsculas y sin espacios", normalizarEmail("  Juan.Perez@Gmail.COM ") === "juan.perez@gmail.com");
check("algo que no es correo se rechaza", normalizarEmail("esto no es un correo <script>") === null);
check("un correo sin dominio se rechaza", normalizarEmail("juan@") === null);
check("Gmail: puntos y +etiqueta son la misma casilla", emailCanonico("ju.an+autopostula@googlemail.com") === "juan@gmail.com");
check("otros dominios: solo se quita la +etiqueta", emailCanonico("ju.an+x@empresa.cl") === "ju.an@empresa.cl");
check("contraseña de 1 carácter: rechazada", problemaConPassword("x") !== null);
check("contraseña de 8: sirve", problemaConPassword("12345678") === null);
check("contraseña de 500 caracteres: rechazada", problemaConPassword("a".repeat(500)) !== null);

// ── §25: ubicación declarada ──────────────────────────────────────────────
check("ubicación: undefined no toca nada", limpiarUbicacion(undefined) === undefined);
check("ubicación: basura se guarda como null", limpiarUbicacion("hola") === null);
const ubic = limpiarUbicacion({ regiones: ["RM", 3], comunas: ["Maipú", { x: 1 }], todaLaRegion: "si", aceptaRemoto: true });
check("ubicación: solo textos en las listas y booleanos de verdad", JSON.stringify(ubic) === JSON.stringify({ regiones: ["RM"], comunas: ["Maipú"], todaLaRegion: false, aceptaRemoto: true }), ubic);

// ── Mayúsculas ───────────────────────────────────────────────────────────
check('"isla de maipo" → "Isla de Maipo"', nombrePropio("isla de maipo") === "Isla de Maipo");
check('"san josé de maipo" → "San José de Maipo"', nombrePropio("san josé de maipo") === "San José de Maipo");
check('"la florida" → "La Florida" (el artículo al principio sí)', nombrePropio("la florida") === "La Florida");
check('"torres del paine" → "Torres del Paine"', nombrePropio("torres del paine") === "Torres del Paine");
check("título de aviso: solo la primera letra", mayusculaInicial("auxiliar de bodega y despacho") === "Auxiliar de bodega y despacho");

// ── §15: días y meses en hora de Chile ───────────────────────────────────
// 28-09-2026 a las 22:30 en Chile (UTC-3 desde el 6 de septiembre) = 29-09 01:30 UTC.
const nocheChile = new Date("2026-09-29T01:30:00Z");
check("a las 22:30 de Chile todavía es el 28", diaEnChile(nocheChile) === "2026-09-28", diaEnChile(nocheChile));
check("y el día empezó a las 03:00 UTC (00:00 de Chile)", inicioDelDiaChile(nocheChile).toISOString() === "2026-09-28T03:00:00.000Z", inicioDelDiaChile(nocheChile).toISOString());
check("el mes empieza el 1 a las 00:00 de Chile (ese día, UTC-4)", inicioDelMesChile(nocheChile).toISOString() === "2026-09-01T04:00:00.000Z", inicioDelMesChile(nocheChile).toISOString());
check("hace 6 días: el 22 a las 00:00 de Chile", inicioDeOtroDiaChile(nocheChile, -6).toISOString() === "2026-09-22T03:00:00.000Z", inicioDeOtroDiaChile(nocheChile, -6).toISOString());
check("fin de mañana = pasado mañana a las 00:00 de Chile", inicioDeOtroDiaChile(nocheChile, 2).toISOString() === "2026-09-30T03:00:00.000Z", inicioDeOtroDiaChile(nocheChile, 2).toISOString());
check("en invierno (UTC-4) también", inicioDelDiaChile(new Date("2026-07-15T15:00:00Z")).toISOString() === "2026-07-15T04:00:00.000Z");

// ── §13: la comuna escrita en el CV cuenta ──────────────────────────────
const textoCv = "Juan Pérez. Correo: juan@correo.cl. Teléfono +56 9 1234 5678. Comuna: Maipú, Región Metropolitana. " + "Experiencia en bodega. ".repeat(20);
const conComunaEnTexto = chequearCv({ texto: textoCv, email: null, telefono: null, comuna: null, experiencia: null });
check("con la comuna escrita en el CV no dice que falta", !conComunaEnTexto.revisiones.some((r) => r.titulo.includes("comuna")), conComunaEnTexto.revisiones);
const sinComuna = chequearCv({ texto: textoCv.replace("Comuna: Maipú, Región Metropolitana. ", ""), email: null, telefono: null, comuna: null, experiencia: null });
check("sin ninguna comuna, sí lo dice", sinComuna.revisiones.some((r) => r.titulo.includes("comuna")), sinComuna.revisiones);

async function conBase() {
  // ── §17: límites de intentos ─────────────────────────────────────────
  const clave = claveLimite("verificar", `${PREFIJO}${Date.now()}`);
  check("la clave no guarda el valor en claro", !clave.includes(PREFIJO));
  const limite = { max: 3, ventanaMs: 60_000 };
  const resultados = [];
  for (let i = 0; i < 4; i++) resultados.push(await permitirIntento(clave, limite));
  check("permite 3 y frena el cuarto", JSON.stringify(resultados) === "[true,true,true,false]", resultados);
  const otra = claveLimite("verificar", `${PREFIJO}otra-${Date.now()}`);
  await anotarIntento(otra);
  check("superaLimite solo cuenta, no anota", (await superaLimite(otra, { max: 2, ventanaMs: 60_000 })) === false && (await superaLimite(otra, { max: 1, ventanaMs: 60_000 })) === true);
  await prisma.limiteTasa.deleteMany({ where: { clave: { in: [clave, otra] } } });

  // ── §20: premios de invitación ───────────────────────────────────────
  const sello = Date.now();
  const creadas: string[] = [];
  const crear = async (email: string, datos: Record<string, unknown> = {}) => {
    const u = await prisma.user.create({ data: { email, emailVerificado: new Date(), ...datos }, select: { id: true } });
    creadas.push(u.id);
    return u.id;
  };
  try {
    // En Gmail los puntos no cuentan: "verificar.revision.123+2" es la misma
    // casilla que "verificarrevision123".
    const anfitrion = await crear(`verificarrevision${sello}@gmail.com`);
    const alias = await crear(`verificar.revision${sello}+2@gmail.com`, { invitadoPorId: anfitrion });
    check("invitarse con un alias del propio Gmail no paga", (await premiarInvitacion(alias)) === false && (await saldoExtras(anfitrion)) === 0);

    const real = await crear(`${PREFIJO}amiga-${sello}@ejemplo.invalid`, { invitadoPorId: anfitrion });
    check("una persona de verdad sí paga", (await premiarInvitacion(real)) === true && (await saldoExtras(anfitrion)) === 10);
    const mismaCasilla = await crear(`${PREFIJO}amiga-${sello}+otra@ejemplo.invalid`, { invitadoPorId: anfitrion });
    check("la misma casilla con otra +etiqueta no paga dos veces", (await premiarInvitacion(mismaCasilla)) === false && (await saldoExtras(anfitrion)) === 10);

    for (let i = 0; i < MAXIMO_INVITACIONES_PREMIADAS_POR_MES + 1; i++) {
      const otraPersona = await crear(`${PREFIJO}persona-${i}-${sello}@ejemplo.invalid`, { invitadoPorId: anfitrion });
      await premiarInvitacion(otraPersona);
    }
    check(
      `el tope de ${MAXIMO_INVITACIONES_PREMIADAS_POR_MES} invitaciones premiadas cada 30 días se respeta`,
      (await saldoExtras(anfitrion)) === 10 * MAXIMO_INVITACIONES_PREMIADAS_POR_MES,
      await saldoExtras(anfitrion),
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: creadas } } });
  }
}

conBase()
  .catch((e) => {
    fallos++;
    console.log("FALLA  la parte con base lanzó una excepción:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(fallos ? `\n${fallos} falla(s)` : "\nTodo OK");
    process.exit(fallos ? 1 : 0);
  });
