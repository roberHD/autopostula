// Verificación de las postulaciones extra y los premios
// (docs/estrategia-y-rediseno.md §7). Esto toca plata, así que se prueba
// contra la base de verdad, con cuentas de mentira que se borran al final:
//   npx tsx scripts/verificar-extras.ts
//
// Si algo falla a la mitad, las cuentas quedan con el prefijo de abajo y se
// pueden borrar a mano sin tocar nada real.
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { anotarExtra, gastarExtra, obtenerCodigoInvitacion, premiarInvitacion, premiarPerfilCompleto, saldoExtras, PREMIOS } from "../lib/extras";
import { obtenerEstadoPostulaciones } from "../lib/postulacion-limits";

const PREFIJO = "verificar-extras-";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

async function crearCuenta(sufijo: string, datos: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { email: `${PREFIJO}${sufijo}-${Date.now()}@ejemplo.invalid`, ...datos },
    select: { id: true, email: true },
  });
}

async function main() {
  const anfitrion = await crearCuenta("anfitrion");

  try {
    // ── El saldo es la suma del libro mayor ──
    check("una cuenta nueva parte en cero", (await saldoExtras(anfitrion.id)) === 0);

    await anotarExtra({ userId: anfitrion.id, cantidad: 20, motivo: "COMPRA", clave: `compra:${anfitrion.id}` });
    check("una compra suma", (await saldoExtras(anfitrion.id)) === 20);

    // Lo más importante de todo esto: Flow avisa del mismo pago más de una vez
    // (la confirmación y el retorno), así que acreditar dos veces tiene que dar
    // un solo paquete.
    const repetida = await anotarExtra({ userId: anfitrion.id, cantidad: 20, motivo: "COMPRA", clave: `compra:${anfitrion.id}` });
    check("el mismo pago no se acredita dos veces", repetida === false && (await saldoExtras(anfitrion.id)) === 20);

    // ── Gastar ──
    const gasto = await gastarExtra(anfitrion.id, "app-de-prueba");
    check("una postulación sin cupo del mes descuenta una extra", gasto && (await saldoExtras(anfitrion.id)) === 19);
    const gastoRepetido = await gastarExtra(anfitrion.id, "app-de-prueba");
    check("reintentar el mismo POST no cobra dos veces", gastoRepetido === false && (await saldoExtras(anfitrion.id)) === 19);

    // ── El cupo: primero el del plan, después las extra ──
    const estado = await obtenerEstadoPostulaciones(anfitrion.id);
    check("el cupo separa lo del mes de lo extra", estado.delMes === 20 && estado.extras === 19, estado);
    check("y lo que se muestra es la suma", estado.restantes === 39, estado);

    // ── Premio por invitar ──
    const invitado = await crearCuenta("invitado", { invitadoPorId: anfitrion.id });
    check("sin verificar el correo no se paga el premio", (await premiarInvitacion(invitado.id)) === false);

    await prisma.user.update({ where: { id: invitado.id }, data: { emailVerificado: new Date() } });
    const pagado = await premiarInvitacion(invitado.id);
    check("con el correo verificado sí se paga", pagado && (await saldoExtras(anfitrion.id)) === 19 + PREMIOS.invitacion);
    check("el mismo invitado no paga dos veces", (await premiarInvitacion(invitado.id)) === false);

    // ── Premio por completar el perfil ──
    const sinPerfil = await crearCuenta("sin-perfil");
    check("sin CV ni objetivo ni portal no hay premio", (await premiarPerfilCompleto(sinPerfil.id)) === false);
    check("...y el saldo sigue en cero", (await saldoExtras(sinPerfil.id)) === 0);

    // ── Código de invitación ──
    const codigo = await obtenerCodigoInvitacion(anfitrion.id);
    check("el código tiene 6 caracteres", codigo.length === 6, codigo);
    check("pedirlo de nuevo devuelve el mismo", (await obtenerCodigoInvitacion(anfitrion.id)) === codigo);
    check("no trae caracteres que se confunden al leerlos (0/O, 1/I/L)", !/[01OIL]/.test(codigo), codigo);
  } finally {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIJO } } });
  }

  console.log(fallos ? `\n${fallos} verificaciones fallaron` : "\nTodo OK");
  process.exit(fallos ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIJO } } }).catch(() => {});
  process.exit(1);
});
