import { Resend } from "resend";
import { getBaseUrl } from "@/lib/base-url";
import {
  RUTA_VER_LAS_DE_PRUEBA,
  TEXTO_DESPUES_DE_LA_PRUEBA,
  TEXTO_PASAR_A_PREMIUM,
  textoPruebaTerminada,
  textoVerLasDePrueba,
} from "@/lib/texto-rafaga";

// Remitente de todos los correos que manda la app.
//
// No hay valor por defecto a propósito. `onboarding@resend.dev` es el dominio
// compartido de prueba de Resend, y solo entrega a la dirección dueña de la
// cuenta: para cualquier otro destinatario acepta el envío y lo descarta. Un
// fallback ahí no degrada el servicio, lo vuelve invisible -- la app cree que
// mandó el correo, la persona nunca lo recibe, y nadie se entera hasta que
// alguien reclama que no puede recuperar su contraseña. Preferimos que reviente.
export function remitente(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error(
      "Falta RESEND_FROM_EMAIL -- sin un remitente de dominio verificado, Resend " +
        "descarta los correos en silencio."
    );
  }
  return from;
}

// Instanciado por llamada, no a nivel de módulo -- si se crea acá arriba,
// falta RESEND_API_KEY tira en cuanto Next carga el módulo para recolectar la
// config de la ruta, y se cae el build entero en vez de solo esta llamada.
function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// docs/verificacion-de-correo.md §5 -- el registro y el reenvío (§6) mandan
// exactamente el mismo correo, con un token nuevo cada vez.
export async function enviarCorreoVerificacion(email: string, token: string) {
  const url = `${getBaseUrl()}/verificar?token=${token}`;
  await getResend().emails.send({
    from: remitente(),
    to: email,
    subject: "Confirma tu correo en AutoPostula",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111827;">Confirma tu correo</h2>
        <p style="color: #4B5563; line-height: 1.6;">
          Con tu correo confirmado puedes conectar la extensión y postular a trabajos. Haz clic en el siguiente enlace (válido por 24 horas):
        </p>
        <p style="margin: 24px 0;">
          <a href="${url}" style="background: #16181A; color: #F4F5F3; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Confirmar mi correo
          </a>
        </p>
        <p style="color: #9CA3AF; font-size: 12px;">
          Si no creaste una cuenta en AutoPostula, puedes ignorar este correo.
        </p>
      </div>
    `,
  });
}

// docs/rafagas-y-ponerse-al-dia.md §4.1: el único correo que recibe una cuenta
// gratis por el tema de las ráfagas -- se manda una sola vez, cuando la
// postulación que se llevó el último cupo de la prueba queda registrada. Las
// frases son las mismas del panel y del popup (lib/texto-rafaga.ts). "Ver las 5"
// lleva al historial filtrado: la prueba se demuestra con resultados concretos.
//
// Armado aparte del envío para poder revisar el contenido sin mandar nada.
export function armarCorreoPruebaTerminada(total: number) {
  const base = getBaseUrl();
  const boton = "display: inline-block; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;";
  return {
    subject: `Tu prueba de AutoPostula terminó: ${total} postulaciones enviadas`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111827;">${textoPruebaTerminada(total)}</h2>
        <p style="margin: 20px 0;">
          <a href="${base}${RUTA_VER_LAS_DE_PRUEBA}" style="${boton} background: #16181A; color: #F4F5F3;">
            ${textoVerLasDePrueba(total)}
          </a>
        </p>
        <p style="color: #4B5563; line-height: 1.6;">${TEXTO_DESPUES_DE_LA_PRUEBA}</p>
        <p style="margin: 20px 0;">
          <a href="${base}/dashboard/premium" style="${boton} border: 1px solid #16181A; color: #16181A;">
            ${TEXTO_PASAR_A_PREMIUM}
          </a>
        </p>
      </div>
    `,
  };
}

export async function enviarCorreoPruebaTerminada(email: string, total: number) {
  const { subject, html } = armarCorreoPruebaTerminada(total);
  await enviarOFallar(email, subject, html);
}

// ── Pases prepagados (docs/pase-prepagado.md §6, §7) ───────────────────

function fechaLarga(fecha: Date): string {
  return fecha.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" });
}

const ESTILO_BOTON = "display: inline-block; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;";
const ESTILO_MARCO = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;";

// §7: comprobante al acreditar -- pase, monto, vigencia y número de orden de
// Flow. NO es una boleta: la boleta electrónica depende del inicio de
// actividades (preguntas-abogado.md §E) y el correo lo dice para no
// confundirlas.
export function armarComprobantePase(datos: { pase: string; monto: number; desde: Date; hasta: Date; flowOrder: string }) {
  return {
    subject: `Tu ${datos.pase} está activo hasta el ${fechaLarga(datos.hasta)}`,
    html: `
      <div style="${ESTILO_MARCO}">
        <h2 style="color: #111827;">Recibimos tu pago</h2>
        <p style="color: #4B5563; line-height: 1.6;">Tu Premium ya está activo.</p>
        <table style="width: 100%; border-collapse: collapse; color: #111827; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #6B7280;">Pase</td><td style="text-align: right;">${datos.pase}</td></tr>
          <tr><td style="padding: 6px 0; color: #6B7280;">Monto</td><td style="text-align: right;">$${datos.monto.toLocaleString("es-CL")} CLP</td></tr>
          <tr><td style="padding: 6px 0; color: #6B7280;">Vigencia</td><td style="text-align: right;">${fechaLarga(datos.desde)} al ${fechaLarga(datos.hasta)}</td></tr>
          <tr><td style="padding: 6px 0; color: #6B7280;">Orden de Flow</td><td style="text-align: right;">${datos.flowOrder}</td></tr>
        </table>
        <p style="color: #4B5563; line-height: 1.6; margin-top: 18px;">
          No se renueva solo: no vamos a volver a cobrarte. Te avisamos antes de que termine.
        </p>
        <p style="color: #9CA3AF; font-size: 12px;">Este correo es un comprobante de tu pago, no una boleta.</p>
      </div>
    `,
  };
}

// El mismo comprobante, para un paquete de postulaciones extra
// (docs/estrategia-y-rediseno.md §7). Tampoco es una boleta, por lo mismo.
export function armarComprobanteExtra(datos: { paquete: string; postulaciones: number; monto: number; saldo: number; flowOrder: string }) {
  return {
    subject: `Recibimos tu pago: ${datos.postulaciones} postulaciones extra`,
    html: `
      <div style="${ESTILO_MARCO}">
        <h2 style="color: #111827;">Recibimos tu pago</h2>
        <p style="color: #4B5563; line-height: 1.6;">Ya están en tu cuenta.</p>
        <table style="width: 100%; border-collapse: collapse; color: #111827; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #6B7280;">Paquete</td><td style="text-align: right;">${datos.paquete}</td></tr>
          <tr><td style="padding: 6px 0; color: #6B7280;">Monto</td><td style="text-align: right;">$${datos.monto.toLocaleString("es-CL")} CLP</td></tr>
          <tr><td style="padding: 6px 0; color: #6B7280;">Saldo ahora</td><td style="text-align: right;">${datos.saldo} postulaciones extra</td></tr>
          <tr><td style="padding: 6px 0; color: #6B7280;">Orden de Flow</td><td style="text-align: right;">${datos.flowOrder}</td></tr>
        </table>
        <p style="color: #4B5563; line-height: 1.6; margin-top: 18px;">
          No vencen y no se renuevan solas: se usan cuando se te acaben las de tu plan en el mes.
        </p>
        <p style="color: #9CA3AF; font-size: 12px;">Este correo es un comprobante de tu pago, no una boleta.</p>
      </div>
    `,
  };
}

// Resend NO lanza cuando rechaza un envío (dominio sin verificar, clave mala):
// devuelve { error }. Estos correos marcan "ya se mandó" en la base (los avisos
// de vencimiento) o son un comprobante de dinero, así que un rechazo silencioso
// no puede pasar por éxito.
async function enviarOFallar(email: string, subject: string, html: string, headers?: Record<string, string>) {
  const { error } = await getResend().emails.send({ from: remitente(), to: email, subject, html, ...(headers ? { headers } : {}) });
  if (error) throw new Error(`Resend rechazó el correo: ${error.message}`);
}

export async function enviarComprobantePase(email: string, datos: { pase: string; monto: number; desde: Date; hasta: Date; flowOrder: string }) {
  const { subject, html } = armarComprobantePase(datos);
  await enviarOFallar(email, subject, html);
}

export async function enviarComprobanteExtra(email: string, datos: { paquete: string; postulaciones: number; monto: number; saldo: number; flowOrder: string }) {
  const { subject, html } = armarComprobanteExtra(datos);
  await enviarOFallar(email, subject, html);
}

// §6: los tres avisos de vencimiento. Los enlaces de renovar llevan directo al
// checkout del pase (con sesión, o pasando por el login que vuelve acá).
export type AvisoPase = "cinco_dias" | "un_dia" | "vencio";

export function armarAvisoPase(tipo: AvisoPase, venceEn: Date) {
  const base = getBaseUrl();
  const renovar = (pase: string) => `${base}/dashboard/premium/pago?pase=${pase}`;
  const botones = `
    <p style="margin: 20px 0;">
      <a href="${renovar("pase_30")}" style="${ESTILO_BOTON} background: #16181A; color: #F4F5F3;">Renovar 30 días</a>
      <a href="${renovar("pase_90")}" style="${ESTILO_BOTON} border: 1px solid #16181A; color: #16181A; margin-left: 8px;">Renovar 90 días</a>
    </p>`;
  const fecha = fechaLarga(venceEn);

  if (tipo === "vencio") {
    return {
      subject: "Tu Premium terminó: volviste al plan gratis",
      html: `
        <div style="${ESTILO_MARCO}">
          <h2 style="color: #111827;">Tu Premium terminó</h2>
          <p style="color: #4B5563; line-height: 1.6;">
            Volviste al plan gratis. Tu historial y tu perfil siguen intactos.
          </p>
          ${botones}
          <p style="color: #9CA3AF; font-size: 12px;">No se renueva solo: no te cobramos nada más.</p>
        </div>
      `,
    };
  }

  const cuando = tipo === "un_dia" ? "mañana" : `el ${fecha}`;
  return {
    subject: tipo === "un_dia" ? "Tu Premium vence mañana" : `Tu Premium vence el ${fecha}`,
    html: `
      <div style="${ESTILO_MARCO}">
        <h2 style="color: #111827;">Tu Premium vence ${cuando}</h2>
        <p style="color: #4B5563; line-height: 1.6;">
          Después vuelves al plan gratis (20 postulaciones al mes, un portal, sin búsqueda automática).
          Si quieres seguir con Premium, renueva antes: los días nuevos se suman a los que te quedan.
        </p>
        ${botones}
        <p style="color: #9CA3AF; font-size: 12px;">No se renueva solo: no te cobramos nada sin que tú lo pidas.</p>
      </div>
    `,
  };
}

export async function enviarAvisoPase(email: string, tipo: AvisoPase, venceEn: Date) {
  const { subject, html } = armarAvisoPase(tipo, venceEn);
  await enviarOFallar(email, subject, html);
}

// ── Recordatorio de ráfagas (docs/rafagas-y-ponerse-al-dia.md §3.8) ──────────

export type DatosRecordatorioRafaga = {
  /** Días completos desde la última puesta al día; null = todavía no se puso al día ninguna vez. */
  dias: number | null;
  /** Ofertas aprobadas en "Por decidir" que esperan enviarse (0 = no se menciona). */
  aprobadas: number;
  /** El enlace que ve la persona (una página). */
  urlBaja: string;
  /** El que usa el cliente de correo con un clic (POST, RFC 8058). */
  urlBajaUnClic: string;
};

// Contenido honesto, sin inventar cifras: NO dice "hay N ofertas nuevas que calzan
// contigo" -- hoy el puntaje no existe del lado del servidor
// (celular-y-escritorio.md §5), así que no se sabe. Lo único que se cuenta es lo que
// sí se sabe: cuánto hace que no se pone al día y cuántas aprobadas esperan.
// Armado aparte del envío para poder revisar el contenido sin mandar nada.
export function armarCorreoRecordatorioRafaga(d: DatosRecordatorioRafaga) {
  const titulo = d.dias === null ? "AutoPostula todavía no se pone al día" : `AutoPostula no se pone al día hace ${d.dias} días`;
  const pendientes =
    d.aprobadas > 0
      ? `<p style="color: #4B5563; line-height: 1.6;">Tienes ${d.aprobadas} ${d.aprobadas === 1 ? "oferta que aprobaste esperando" : "ofertas que aprobaste esperando"} para enviarse.</p>`
      : "";
  return {
    subject: titulo,
    html: `
      <div style="${ESTILO_MARCO}">
        <h2 style="color: #111827;">${titulo}</h2>
        <p style="color: #4B5563; line-height: 1.6;">Abre Chrome en tu computador unos minutos y se pone al día solo.</p>
        ${pendientes}
        <p style="margin-top: 28px; font-size: 12px;">
          <a href="${d.urlBaja.replace(/&/g, "&amp;")}" style="color: #9CA3AF;">Dejar de recibir estos avisos</a>
        </p>
      </div>
    `,
    // Gmail y Outlook muestran "Cancelar suscripción" arriba del correo con esto.
    headers: {
      "List-Unsubscribe": `<${d.urlBajaUnClic}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export async function enviarCorreoRecordatorioRafaga(email: string, datos: DatosRecordatorioRafaga) {
  const { subject, html, headers } = armarCorreoRecordatorioRafaga(datos);
  await enviarOFallar(email, subject, html, headers);
}
