import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { obtenerModoAutomatico } from "@/lib/prueba-automatica";

// docs/revision-2026-09-16.md §1.2: toda cuenta nueva parte con
// postulacionHabilitada=false (solo observar, sin importar el toggle del
// popup) hasta que la persona la activa acá, a propósito, después de ver qué
// habría postulado. Requiere objetivo confirmado y perfil compilado -- sin
// eso, "activar" sería la misma ruleta rusa que este documento encontró.
//
// TODO(§2.1): sumar la ubicación declarada como tercer requisito apenas
// exista ese campo -- hoy no se puede exigir algo que el producto todavía no
// pide en ningún formulario.
async function evaluarRequisitos(userId: string) {
  const [user, prefs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { objetivoConfirmado: true, postulacionHabilitada: true } }),
    prisma.searchPreferences.findUnique({ where: { userId }, select: { perfilCompilado: true } }),
  ]);

  const objetivoConfirmado = !!user?.objetivoConfirmado;
  const perfilCompilado = !!prefs?.perfilCompilado;

  let motivo: string | null = null;
  if (!objetivoConfirmado && !perfilCompilado) motivo = "Confirma tu objetivo laboral y compila tu perfil de búsqueda primero";
  else if (!objetivoConfirmado) motivo = "Confirma tu objetivo laboral primero";
  else if (!perfilCompilado) motivo = "Compila tu perfil de búsqueda primero";

  return { puedeActivar: !motivo, motivo, yaHabilitada: !!user?.postulacionHabilitada };
}

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { puedeActivar, motivo, yaHabilitada } = await evaluarRequisitos(userId);
  return NextResponse.json({ postulacionHabilitada: yaHabilitada, puedeActivar, motivo });
}

export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { puedeActivar, motivo, yaHabilitada } = await evaluarRequisitos(userId);
  if (yaHabilitada) {
    return NextResponse.json({ ok: true, postulacionHabilitada: true, recienActivada: false });
  }
  if (!puedeActivar) {
    return NextResponse.json({ error: motivo }, { status: 400 });
  }

  // docs/rafagas-y-ponerse-al-dia.md §4.1: activar es el momento en que la
  // persona acaba de decir "sí, actúa", y el panel le pide a la extensión una
  // ráfaga de inmediato -- una sola vez, no cada vez que se repita esta llamada.
  // `recienActivada` distingue ese momento; el updateMany condicionado deja que,
  // si llegan dos POST a la vez, solo uno lo cuente.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, postulacionHabilitada: false },
    data: { postulacionHabilitada: true },
  });

  // `modo` le dice al panel si hay algo automático que arrancar (premium o
  // prueba) o si esta cuenta postula solo entrando a un portal (manual).
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, rol: true, pruebaAutomaticaRestantes: true },
  });
  return NextResponse.json({
    ok: true,
    postulacionHabilitada: true,
    recienActivada: count === 1,
    modo: await obtenerModoAutomatico(usuario),
  });
}
