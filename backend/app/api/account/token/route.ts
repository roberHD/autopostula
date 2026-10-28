import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { nuevoToken } from "@/lib/token";

// docs/verificacion-de-correo.md §5: sin correo verificado no se obtiene el
// token de la extensión, ni leyéndolo (GET) ni generándolo (POST) -- es lo
// único que postula a trabajos en nombre de la cuenta. requiereVerificacion
// deja que el frontend distinga esto de un 401/403 cualquiera y muestre el
// botón de reenviar en vez de un error genérico.
async function bloqueadoPorVerificacion(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerificado: true },
  });
  return !user?.emailVerificado;
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (await bloqueadoPorVerificacion(userId)) {
    return NextResponse.json(
      { error: "Verifica tu correo para conectar la extensión", requiereVerificacion: true },
      { status: 403 }
    );
  }

  // La base guarda solo el hash del token (lib/token.ts): no hay cómo
  // devolverlo. Se dice si existe, y el token se entrega una sola vez, en el
  // POST que lo genera.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiToken: true },
  });

  return NextResponse.json({ tieneToken: !!user?.apiToken });
}

export async function POST() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (await bloqueadoPorVerificacion(userId)) {
    return NextResponse.json(
      { error: "Verifica tu correo para conectar la extensión", requiereVerificacion: true },
      { status: 403 }
    );
  }

  // Se guarda el hash y se devuelve el token: es la única vez que sale del
  // servidor (lib/token.ts). Generar uno nuevo desconecta la extensión que
  // tenía el anterior.
  const { token, hash } = nuevoToken();

  await prisma.user.update({
    where: { id: userId },
    data: { apiToken: hash },
  });

  return NextResponse.json({ apiToken: token });
}
