import { prisma } from "./prisma";
import { obtenerModoAutomatico } from "./prueba-automatica";
import { urlBajaRecordatorios, urlBajaUnClic } from "./baja-recordatorios";
import { enviarCorreoRecordatorioRafaga, type DatosRecordatorioRafaga } from "./correo";

// docs/rafagas-y-ponerse-al-dia.md §3.8: el recordatorio por correo para quien lleva
// días sin ponerse al día. La decisión de a quién se le manda es una función pura
// (decidirRecordatorio) para poder probarla por tabla; lo de abajo la aplica contra
// la base y manda.

const HORA_MS = 3_600_000;

/** Sin ponerse al día por tanto tiempo, se avisa (§3.8). */
export const HORAS_SIN_PONERSE_AL_DIA = 48;
/** Entre un recordatorio y el siguiente (§3.8). */
export const HORAS_ENTRE_RECORDATORIOS = 72;
/**
 * Pasado este tiempo sin ponerse al día ya no se insiste. §3.8 no lo dice, pero
 * sin tope la regla manda un correo cada 3 días PARA SIEMPRE a quien se fue: un
 * correo más no lo va a traer de vuelta, y cada uno es un pedido de baja
 * esperando. Con 14 días salen como máximo cinco (días 2, 5, 8, 11 y 14).
 */
export const DIAS_MAXIMOS_SIN_ACTIVIDAD = 14;
/** Tope de correos por corrida: el resto sale mañana (una corrida larga no debe morir a medias). */
export const MAXIMO_POR_CORRIDA = 100;

export type MotivoNoRecordar =
  | "sin_recordatorios" // se dio de baja
  | "no_premium" // el aviso es de Premium: una cuenta gratis solo recibe el de fin de prueba (§4.1)
  | "pausada"
  | "sin_extension"
  | "sin_correo_verificado"
  | "sin_referencia" // no se sabe desde cuándo: nunca corrió una ráfaga y no se sabe cuándo se conectó
  | "reciente"
  | "abandonada"
  | "ya_recordado";

export type DecisionRecordatorio =
  | { enviar: true; horasSinPonerse: number; nunca: boolean }
  | { enviar: false; motivo: MotivoNoRecordar };

export type PerfilRecordatorio = {
  /** modo === "premium": el plan (o ser admin) incluye las ráfagas. */
  premium: boolean;
  busquedaAutomaticaActiva: boolean;
  extensionConectada: boolean;
  emailVerificado: Date | null;
  recordatoriosActivos: boolean;
  ultimaRafagaEn: Date | null;
  extensionConectadaEn: Date | null;
  recordatorioRafagaEn: Date | null;
};

export function decidirRecordatorio(u: PerfilRecordatorio, ahora: Date): DecisionRecordatorio {
  const no = (motivo: MotivoNoRecordar): DecisionRecordatorio => ({ enviar: false, motivo });

  if (!u.recordatoriosActivos) return no("sin_recordatorios");
  if (!u.premium) return no("no_premium");
  if (!u.busquedaAutomaticaActiva) return no("pausada");
  if (!u.extensionConectada) return no("sin_extension");
  if (!u.emailVerificado) return no("sin_correo_verificado");

  // Desde cuándo cuenta: la última puesta al día o, si nunca hubo una, desde que se
  // conectó la extensión. Sin ninguna de las dos no se sabe hace cuánto (cuentas
  // conectadas antes de que existiera extensionConectadaEn): decir "hace 2 días" sin
  // saberlo sería inventarlo, y una extensión anterior a las ráfagas -- que sigue
  // buscando con su alarma de siempre -- nunca las reporta.
  const desde = u.ultimaRafagaEn ?? u.extensionConectadaEn;
  if (!desde) return no("sin_referencia");

  const horas = (ahora.getTime() - desde.getTime()) / HORA_MS;
  if (horas < HORAS_SIN_PONERSE_AL_DIA) return no("reciente");
  if (horas > DIAS_MAXIMOS_SIN_ACTIVIDAD * 24) return no("abandonada");
  if (u.recordatorioRafagaEn && (ahora.getTime() - u.recordatorioRafagaEn.getTime()) / HORA_MS < HORAS_ENTRE_RECORDATORIOS) {
    return no("ya_recordado");
  }
  return { enviar: true, horasSinPonerse: horas, nunca: !u.ultimaRafagaEn };
}

export type ResultadoRecordatorios = {
  candidatos: number;
  enviados: number;
  /** El envío falló: no se marca, así que mañana se reintenta. */
  fallidos: number;
  /** Cumplían todo pero ya se llegó al tope de la corrida. */
  diferidos: number;
  omitidos: Partial<Record<MotivoNoRecordar, number>>;
};

/**
 * Manda los recordatorios que correspondan ahora. `enviar` y `ahora` son
 * inyectables para probarlo sin mandar correos de verdad.
 */
export async function ejecutarRecordatorios(opciones: {
  ahora?: Date;
  enviar?: (email: string, datos: DatosRecordatorioRafaga) => Promise<void>;
} = {}): Promise<ResultadoRecordatorios> {
  const ahora = opciones.ahora ?? new Date();
  const enviar = opciones.enviar ?? enviarCorreoRecordatorioRafaga;
  const desde = (horas: number) => new Date(ahora.getTime() - horas * HORA_MS);
  const hace48 = desde(HORAS_SIN_PONERSE_AL_DIA);
  const tope = desde(DIAS_MAXIMOS_SIN_ACTIVIDAD * 24);

  // Filtro grueso en la base (lo mismo que decidirRecordatorio, para no traer a
  // todo el mundo); la decisión final es de decidirRecordatorio, que es la que
  // se prueba. Sin `take`: lo que no es Premium se descarta después, y con un
  // límite acá las cuentas gratis podrían dejar afuera a las Premium.
  const candidatos = await prisma.user.findMany({
    where: {
      recordatoriosActivos: true,
      busquedaAutomaticaActiva: true,
      extensionConectada: true,
      emailVerificado: { not: null },
      OR: [
        { ultimaRafagaEn: { lte: hace48, gte: tope } },
        { ultimaRafagaEn: null, extensionConectadaEn: { lte: hace48, gte: tope } },
      ],
    },
    select: {
      id: true,
      email: true,
      rol: true,
      pruebaAutomaticaRestantes: true,
      busquedaAutomaticaActiva: true,
      extensionConectada: true,
      emailVerificado: true,
      recordatoriosActivos: true,
      ultimaRafagaEn: true,
      extensionConectadaEn: true,
      recordatorioRafagaEn: true,
    },
    orderBy: { ultimaRafagaEn: "asc" },
  });

  const resultado: ResultadoRecordatorios = { candidatos: candidatos.length, enviados: 0, fallidos: 0, diferidos: 0, omitidos: {} };

  for (const u of candidatos) {
    const modo = await obtenerModoAutomatico(u);
    const decision = decidirRecordatorio({ ...u, premium: modo === "premium" }, ahora);
    if (!decision.enviar) {
      resultado.omitidos[decision.motivo] = (resultado.omitidos[decision.motivo] ?? 0) + 1;
      continue;
    }
    if (resultado.enviados >= MAXIMO_POR_CORRIDA) {
      resultado.diferidos++;
      continue;
    }

    // Las mismas que la extensión enviaría al abrir Chrome (/api/extension/perfil):
    // sin URL o sin portal no hay cómo enviarlas, así que no se cuentan.
    const aprobadas = await prisma.decisionOferta.count({
      where: { userId: u.id, fuente: "BANDA_GRIS", veredicto: "SI", jobOfferId: null, url: { not: null }, plataforma: { not: null } },
    });

    try {
      await enviar(u.email, {
        dias: decision.nunca ? null : Math.floor(decision.horasSinPonerse / 24),
        aprobadas,
        urlBaja: urlBajaRecordatorios(u.id),
        urlBajaUnClic: urlBajaUnClic(u.id),
      });
      // Después de enviar: si el envío falla no se marca, y mañana se reintenta.
      await prisma.user.update({ where: { id: u.id }, data: { recordatorioRafagaEn: ahora } });
      resultado.enviados++;
    } catch (err) {
      resultado.fallidos++;
      console.error("[recordatorio-rafaga] No se pudo mandar el recordatorio:", u.id, err);
    }
  }

  return resultado;
}
