import { prisma } from "@/lib/prisma";
import { enviarOFallar } from "@/lib/correo";
import { getBaseUrl } from "@/lib/base-url";
import { DERECHOS, numeroSolicitud, type TipoDerecho } from "@/lib/textos-derechos";

/**
 * Solicitudes de derechos sobre datos personales (Ley 19.628 modificada por la
 * 21.719, art. 11).
 *
 * Lo que pide la ley y cómo se cumple acá:
 *  - Acusar recibo: al crearla, un correo al titular con el número y el plazo.
 *  - Responder por escrito dentro de 30 días corridos, prorrogables una sola vez
 *    por otros 30: `venceEn`, y `prorrogar()` solo una vez.
 *  - Guardar el respaldo de la respuesta, su fecha y su contenido íntegro:
 *    `respuesta` y `respondidaEn`, en una fila que sobrevive al borrado de la
 *    cuenta (ver schema.prisma).
 *  - Si se rechaza, decir por qué y avisar que hay 30 días hábiles para
 *    reclamar ante la Agencia: va en el correo de rechazo, siempre.
 *
 * Las solicitudes se crean desde el panel (Ajustes) o las registra el equipo
 * cuando llegan por correo. Las responde el equipo desde /dashboard/derechos
 * (solo cuentas ADMIN). Un cron avisa a la casilla de soporte las que vencen.
 */

// Por acá salen todos los correos de las solicitudes. Es un objeto y no una
// llamada directa para que scripts/verificar-derechos.ts pueda probar el flujo
// completo sin mandar correos de verdad.
export const envio = { correo: enviarOFallar };

const DIA_MS = 24 * 3_600_000;
export const DIAS_PLAZO = 30;
export const DIAS_AVISO_VENCIMIENTO = 5;

export function fechaLarga(fecha: Date): string {
  return fecha.toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long", year: "numeric" });
}

function escapar(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

function plantilla(titulo: string, cuerpo: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color: #111827;">${titulo}</h2>
      ${cuerpo}
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 28px;">
        AutoPostula · <a href="${getBaseUrl()}/privacidad" style="color: #9CA3AF;">Política de privacidad</a>
      </p>
    </div>`;
}

const p = (texto: string) => `<p style="color: #4B5563; line-height: 1.6;">${texto}</p>`;

export async function esAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { rol: true } });
  return user?.rol === "ADMIN";
}

/**
 * Crea la solicitud y manda el acuse de recibo al titular y el aviso al equipo.
 * Si algún correo falla, la solicitud queda creada igual (cuenta desde que se
 * recibió); el error se registra para revisarlo.
 */
export async function crearSolicitud(datos: {
  userId: string | null;
  email: string;
  tipo: TipoDerecho;
  detalle: string;
  origen: "panel" | "correo";
  recibidaEn?: Date;
}) {
  const recibidaEn = datos.recibidaEn ?? new Date();
  const solicitud = await prisma.solicitudDerecho.create({
    data: {
      userId: datos.userId,
      email: datos.email,
      tipo: datos.tipo,
      detalle: datos.detalle,
      origen: datos.origen,
      recibidaEn,
      venceEn: new Date(recibidaEn.getTime() + DIAS_PLAZO * DIA_MS),
    },
  });

  const numero = numeroSolicitud(solicitud.id);
  const nombre = DERECHOS[datos.tipo].nombre;
  await envio.correo(
    datos.email,
    `Recibimos tu solicitud sobre tus datos (N° ${numero})`,
    plantilla(
      "Recibimos tu solicitud",
      p(`Recibimos tu solicitud de <strong>${nombre.toLowerCase()}</strong> sobre tus datos personales el ${fechaLarga(recibidaEn)}. Su número es <strong>${numero}</strong>.`) +
        p(`Te vamos a responder por escrito a este correo a más tardar el <strong>${fechaLarga(solicitud.venceEn)}</strong>. Si necesitáramos más tiempo, te lo avisaremos antes; el plazo se puede extender una sola vez, por otros 30 días.`) +
        p(`Lo que nos escribiste:<br><em>${escapar(datos.detalle)}</em>`)
    )
  ).catch((e) => console.error("[derechos] no salió el acuse de recibo:", e));

  const soporte = process.env.SOPORTE_EMAIL;
  if (soporte) {
    await envio.correo(
      soporte,
      `[Derechos] ${nombre} — N° ${numero} — vence el ${fechaLarga(solicitud.venceEn)}`,
      plantilla(
        `Nueva solicitud de ${nombre.toLowerCase()}`,
        p(`De: ${escapar(datos.email)} (${datos.origen === "panel" ? "desde el panel" : "registrada a mano"})`) +
          p(`Recibida: ${fechaLarga(recibidaEn)} · <strong>Vence: ${fechaLarga(solicitud.venceEn)}</strong>`) +
          p(escapar(datos.detalle)) +
          p(`<a href="${getBaseUrl()}/dashboard/derechos">Responderla en el panel</a>`)
      ),
      undefined,
      { replyTo: [datos.email] }
    ).catch((e) => console.error("[derechos] no salió el aviso al equipo:", e));
  } else {
    console.error("[derechos] Falta SOPORTE_EMAIL: nadie se enteró de la solicitud", solicitud.id);
  }

  return solicitud;
}

type Resultado = { ok: true } | { ok: false; error: string };

function abierta(estado: string) {
  return estado === "RECIBIDA" || estado === "PRORROGADA";
}

/** Responde (acoge) o rechaza la solicitud, guarda el texto y se lo manda al titular. */
export async function cerrarSolicitud(id: string, como: "RESPONDIDA" | "RECHAZADA", texto: string): Promise<Resultado> {
  const s = await prisma.solicitudDerecho.findUnique({ where: { id } });
  if (!s) return { ok: false, error: "No existe esa solicitud." };
  if (!abierta(s.estado)) return { ok: false, error: "Esa solicitud ya está cerrada." };

  const numero = numeroSolicitud(s.id);
  const avisoAgencia =
    como === "RECHAZADA"
      ? p(
          "No podemos acoger tu solicitud por lo que te explicamos arriba. Si no estás de acuerdo, tienes <strong>30 días hábiles</strong> desde este correo para presentar un reclamo ante la <strong>Agencia de Protección de Datos Personales</strong>."
        )
      : "";
  // Primero el correo y después la base: si el correo no sale, la solicitud
  // sigue abierta en vez de figurar respondida sin que el titular lo sepa.
  await envio.correo(
    s.email,
    `Respuesta a tu solicitud sobre tus datos (N° ${numero})`,
    plantilla(
      "Respuesta a tu solicitud",
      p(`Sobre tu solicitud de <strong>${DERECHOS[s.tipo as TipoDerecho].nombre.toLowerCase()}</strong> N° ${numero}, recibida el ${fechaLarga(s.recibidaEn)}:`) +
        p(escapar(texto)) +
        avisoAgencia
    )
  );
  await prisma.solicitudDerecho.update({
    where: { id },
    data: { estado: como, respuesta: texto, respondidaEn: new Date() },
  });
  return { ok: true };
}

/** Extiende el plazo 30 días más, una sola vez, avisándole al titular por qué. */
export async function prorrogarSolicitud(id: string, motivo: string): Promise<Resultado> {
  const s = await prisma.solicitudDerecho.findUnique({ where: { id } });
  if (!s) return { ok: false, error: "No existe esa solicitud." };
  if (s.estado !== "RECIBIDA") {
    return { ok: false, error: s.estado === "PRORROGADA" ? "El plazo ya se extendió una vez: la ley no permite otra." : "Esa solicitud ya está cerrada." };
  }
  if (s.venceEn.getTime() < Date.now()) return { ok: false, error: "El plazo ya venció: hay que responderla ahora." };

  const nuevoVence = new Date(s.venceEn.getTime() + DIAS_PLAZO * DIA_MS);
  const numero = numeroSolicitud(s.id);
  await envio.correo(
    s.email,
    `Necesitamos más tiempo para tu solicitud (N° ${numero})`,
    plantilla(
      "Necesitamos más tiempo",
      p(`Para responder tu solicitud N° ${numero} necesitamos extender el plazo, por esta razón:`) +
        p(escapar(motivo)) +
        p(`Te responderemos a más tardar el <strong>${fechaLarga(nuevoVence)}</strong>. Esta es la única extensión que permite la ley.`)
    )
  );
  await prisma.solicitudDerecho.update({
    where: { id },
    data: { estado: "PRORROGADA", prorrogadaEn: new Date(), motivoProrroga: motivo, venceEn: nuevoVence },
  });
  return { ok: true };
}

/** Las abiertas que vencen en 5 días o menos (o ya vencieron), sin aviso hoy. */
export async function solicitudesPorVencer(ahora: Date = new Date()) {
  const limite = new Date(ahora.getTime() + DIAS_AVISO_VENCIMIENTO * DIA_MS);
  const hace20h = new Date(ahora.getTime() - 20 * 3_600_000);
  return prisma.solicitudDerecho.findMany({
    where: {
      estado: { in: ["RECIBIDA", "PRORROGADA"] },
      venceEn: { lte: limite },
      OR: [{ avisoVencimientoEn: null }, { avisoVencimientoEn: { lt: hace20h } }],
    },
    orderBy: { venceEn: "asc" },
  });
}

export function diasRestantes(venceEn: Date, ahora: Date = new Date()): number {
  return Math.ceil((venceEn.getTime() - ahora.getTime()) / DIA_MS);
}

/** El aviso diario al equipo. Devuelve cuántas solicitudes incluyó. */
export async function avisarSolicitudesPorVencer(ahora: Date = new Date()): Promise<number> {
  const pendientes = await solicitudesPorVencer(ahora);
  if (!pendientes.length) return 0;
  const soporte = process.env.SOPORTE_EMAIL;
  if (!soporte) {
    console.error("[derechos] Falta SOPORTE_EMAIL: no hay a quién avisar de las solicitudes por vencer");
    return 0;
  }
  const filas = pendientes
    .map((s) => {
      const d = diasRestantes(s.venceEn, ahora);
      const cuando = d < 0 ? `<strong style="color:#B91C1C">venció hace ${-d} día(s)</strong>` : d === 0 ? "<strong>vence hoy</strong>" : `vence en ${d} día(s)`;
      return `<li>N° ${numeroSolicitud(s.id)} · ${DERECHOS[s.tipo as TipoDerecho].nombre} · ${escapar(s.email)} · ${cuando}</li>`;
    })
    .join("");
  await envio.correo(
    soporte,
    `[Derechos] ${pendientes.length} solicitud(es) por vencer`,
    plantilla(
      "Solicitudes de derechos por vencer",
      p("La ley pide responder dentro del plazo. Estas siguen abiertas:") +
        `<ul style="color:#4B5563; line-height:1.8;">${filas}</ul>` +
        p(`<a href="${getBaseUrl()}/dashboard/derechos">Responderlas en el panel</a>`)
    )
  );
  await prisma.solicitudDerecho.updateMany({
    where: { id: { in: pendientes.map((s) => s.id) } },
    data: { avisoVencimientoEn: ahora },
  });
  return pendientes.length;
}
