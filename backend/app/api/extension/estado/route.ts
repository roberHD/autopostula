import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estadoExtension } from "@/lib/estado-extension";

/**
 * El estado de la extensión, desde la extensión (docs/estrategia-y-rediseno.md §6).
 *
 * El popup dejó de guardar sus propios interruptores en chrome.storage: lo que
 * la persona toca ahí se escribe acá, en la cuenta, y el panel muestra lo
 * mismo. Dos usos:
 *
 *   POST { pausada } | { soloObservar } | { revisarAntes }
 *        La persona lo cambió en el popup.
 *
 *   POST { migrar: { pausada?, soloObservar?, revisarAntes?, info? } }
 *        Una sola vez, la primera vez que una extensión ya instalada corre con
 *        esta versión: sube lo que tenía guardado en ESE navegador. Solo llena
 *        lo que la cuenta todavía no tiene dicho (columnas en null), así que
 *        dos navegadores con configuraciones distintas no se pisan: gana el
 *        primero que sube, y después manda el servidor.
 *
 * La pausa sí se puede migrar aunque no sea null (busquedaAutomaticaActiva
 * nunca lo es), pero solo en una dirección: si en ese navegador la extensión
 * estaba apagada, la cuenta queda pausada. Al revés no -- que un navegador
 * viejo diga "activo" no puede reanudar lo que la persona pausó en el panel.
 */

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// [{id, texto}], como lo guardaba el popup. Se limpia acá: es texto que
// termina en el prompt que responde formularios.
const MAX_INFO = 30;
const MAX_LARGO = 300;

function limpiarInfo(valor: unknown) {
  if (!Array.isArray(valor)) return null;
  return valor
    .map((it: any) => ({ id: String(it?.id ?? ""), texto: String(it?.texto ?? "").trim().slice(0, MAX_LARGO) }))
    .filter((it) => it.texto)
    .slice(0, MAX_INFO);
}

export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body && typeof body === "object" && body.migrar && typeof body.migrar === "object") {
    const m = body.migrar as Record<string, unknown>;
    if (m.pausada === true && user.busquedaAutomaticaActiva) data.busquedaAutomaticaActiva = false;
    if (typeof m.soloObservar === "boolean" && user.soloObservar === null) data.soloObservar = m.soloObservar;
    if (typeof m.revisarAntes === "boolean" && user.revisarAntesDeEnviar === null) data.revisarAntesDeEnviar = m.revisarAntes;
    if (user.infoAdicional == null) {
      const info = limpiarInfo(m.info);
      if (info?.length) data.infoAdicional = info;
    }
  } else if (typeof body.agregarInfo === "string") {
    // Desde el panel de revisión: la IA dijo que falta un dato ("¿tienes
    // licencia B?") y la persona lo escribió ahí mismo. Guardarlo en la cuenta
    // es la diferencia entre responderlo una vez y no volver a verlo nunca.
    const texto = body.agregarInfo.trim().slice(0, MAX_LARGO);
    if (!texto) {
      return NextResponse.json({ error: "El dato viene vacío" }, { status: 400 });
    }
    const previos = Array.isArray(user.infoAdicional) ? (user.infoAdicional as any[]) : [];
    const yaEsta = previos.some((it) => String(it?.texto ?? "").trim().toLowerCase() === texto.toLowerCase());
    if (!yaEsta) {
      data.infoAdicional = [...previos, { id: String(Date.now()), texto }].slice(-MAX_INFO);
    }
  } else {
    if (typeof body.pausada === "boolean") data.busquedaAutomaticaActiva = !body.pausada;
    if (typeof body.soloObservar === "boolean") data.soloObservar = body.soloObservar;
    if (typeof body.revisarAntes === "boolean") data.revisarAntesDeEnviar = body.revisarAntes;
    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });
    }
  }

  const actualizado = Object.keys(data).length
    ? await prisma.user.update({
        where: { id: user.id },
        data,
        select: {
          busquedaAutomaticaActiva: true,
          soloObservar: true,
          revisarAntesDeEnviar: true,
          postulacionHabilitada: true,
          infoAdicional: true,
        },
      })
    : user;

  return NextResponse.json({
    ok: true,
    estado: estadoExtension(actualizado),
    infoAdicional: Array.isArray(actualizado.infoAdicional) ? actualizado.infoAdicional : [],
  });
}
