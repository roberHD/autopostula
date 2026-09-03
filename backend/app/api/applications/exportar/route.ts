import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { usuarioTieneAnaliticaAvanzada } from "@/lib/plan-beneficios";

// Escapa comillas y envuelve en comillas solo si el valor las necesita (tiene
// coma, comilla o salto de línea) -- así un título o empresa con coma no
// rompe las columnas del CSV.
function celda(valor: string) {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!(await usuarioTieneAnaliticaAvanzada(userId))) {
    return NextResponse.json(
      { error: "Exportar tu historial es una función premium.", requierePremium: true },
      { status: 403 }
    );
  }

  const applications = await prisma.application.findMany({
    where: { userId },
    orderBy: { enviadaEn: "desc" },
    include: {
      jobOffer: { include: { platform: true } },
    },
  });

  const encabezado = ["Cargo", "Empresa", "Portal", "Estado", "Fecha", "Match (%)"];
  const filas = applications.map((a) =>
    [
      celda(a.jobOffer.titulo),
      celda(a.jobOffer.empresa ?? ""),
      celda(a.jobOffer.platform.nombre),
      celda(a.estadoActual),
      celda(a.enviadaEn.toISOString().slice(0, 10)),
      celda(a.jobOffer.relevanciaAi != null ? String(Math.round(a.jobOffer.relevanciaAi)) : ""),
    ].join(",")
  );

  // BOM al inicio para que Excel en Windows detecte UTF-8 y no rompa las tildes.
  const csv = "﻿" + [encabezado.join(","), ...filas].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="postulaciones-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
