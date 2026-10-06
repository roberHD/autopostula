// Verificación de las monedas (lib/monedas.ts): las horas de uso y la moneda
// diaria por conversar con la IA. Se prueba contra la base de verdad, con
// cuentas de mentira que se borran al final:
//   npx tsx scripts/verificar-monedas.ts
//
// Si algo falla a la mitad, las cuentas quedan con el prefijo de abajo y se
// pueden borrar a mano sin tocar nada real.
import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  anotarHoraDeUso,
  conversacionDeHoy,
  minutosDeConversacionHoy,
  premiarConversacion,
  saldoMonedas,
} from "../lib/monedas";
import { inicioDelDiaChile } from "../lib/tiempo";

const PREFIJO = "verificar-monedas-";
const MIN = 60_000;

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

// Un mensaje de la persona en la conversación, como lo anota la ruta del chat.
function mensaje(userId: string, en: Date, tipo = "conversacion_estilo") {
  return prisma.aiUsageLog.create({ data: { userId, tipo, creadoEn: en } });
}

async function main() {
  const cuenta = await prisma.user.create({
    data: { email: `${PREFIJO}${Date.now()}@ejemplo.invalid` },
    select: { id: true },
  });
  const id = cuenta.id;

  try {
    // ── Horas de uso ──
    check("una cuenta nueva parte en cero", (await saldoMonedas(id)) === 0);

    const hora = new Date("2026-03-10T15:05:00Z");
    check("el primer aviso de una hora gana la moneda", (await anotarHoraDeUso(id, "panel", hora)) === true);
    check(
      "la extensión en la misma hora no suma otra",
      (await anotarHoraDeUso(id, "extension", new Date("2026-03-10T15:59:00Z"))) === false
    );
    check("la hora siguiente sí", (await anotarHoraDeUso(id, "extension", new Date("2026-03-10T16:00:00Z"))) === true);
    check("van 2 monedas", (await saldoMonedas(id)) === 2, await saldoMonedas(id));

    // ── Conversación: 1 moneda al día por 10 minutos con mensajes ──
    // Un mediodía en Chile; todos los mensajes van dentro de ese día.
    const dia = new Date(inicioDelDiaChile(new Date("2026-03-11T15:00:00Z")).getTime() + 12 * 60 * MIN);
    const inicio = inicioDelDiaChile(dia);

    await mensaje(id, new Date(inicio.getTime() - 5 * MIN)); // ayer, en Chile: no cuenta hoy
    await mensaje(id, new Date(inicio.getTime() + 1 * MIN), "conversacion_estilo_inicio"); // el saludo de la IA
    for (let i = 0; i < 9; i++) await mensaje(id, new Date(inicio.getTime() + (10 + i) * MIN));
    await mensaje(id, new Date(inicio.getTime() + 18 * MIN + 20_000)); // otro mensaje en un minuto que ya contaba

    check(
      "cuenta minutos distintos de hoy: ni ayer, ni el saludo, ni dos mensajes del mismo minuto",
      (await minutosDeConversacionHoy(id, dia)) === 9,
      await minutosDeConversacionHoy(id, dia)
    );
    let r = await premiarConversacion(id, dia);
    check("con 9 minutos todavía no hay moneda", r.ganada === false && r.minutos === 9, r);
    check("...y el saldo sigue en 2", (await saldoMonedas(id)) === 2);

    await mensaje(id, new Date(inicio.getTime() + 30 * MIN));
    r = await premiarConversacion(id, dia);
    check("al décimo minuto gana 1 moneda (no 10)", r.ganada === true && (await saldoMonedas(id)) === 3, r);

    await mensaje(id, new Date(inicio.getTime() + 31 * MIN));
    r = await premiarConversacion(id, dia);
    check("el minuto 11 del mismo día no da otra", r.ganada === false && (await saldoMonedas(id)) === 3, r);

    const estado = await conversacionDeHoy(id, dia);
    check("el widget ve la de hoy como ganada, con los minutos topados en 10", estado.ganada && estado.minutos === 10, estado);

    // ── Al día siguiente se puede ganar otra ──
    const manana = new Date(dia.getTime() + 24 * 60 * MIN);
    const inicioManana = inicioDelDiaChile(manana);
    check("al día siguiente parte de cero", (await conversacionDeHoy(id, manana)).minutos === 0);
    for (let i = 0; i < 10; i++) await mensaje(id, new Date(inicioManana.getTime() + (60 + i) * MIN));
    r = await premiarConversacion(id, manana);
    check("y con 10 minutos ese día gana la suya", r.ganada === true && (await saldoMonedas(id)) === 4, r);
  } finally {
    await prisma.user.delete({ where: { id } }); // borra en cascada sus monedas y registros de IA
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
