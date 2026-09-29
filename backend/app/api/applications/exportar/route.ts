import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { usuarioTieneAnaliticaAvanzada } from "@/lib/plan-beneficios";
import { fraseEstado } from "@/lib/palabras-estado";
import { datosDeLaOferta } from "@/lib/datos-postulacion";

// Escapa comillas y envuelve en comillas solo si el valor las necesita (tiene
// coma, comilla o salto de línea) -- así un título o empresa con coma no
// rompe las columnas del CSV.
//
// docs/revision-2026-09-28.md: el título y la empresa los escribe quien
// publica el aviso. Si uno empieza con =, +, -, @ o un tabulador, Excel lo
// toma como fórmula al abrir el archivo (por ejemplo =HYPERLINK(...) hacia
// otro sitio). Con un apóstrofo delante queda como texto.
function celda(valor: string) {
  if (/^[=+\-@\t\r]/.test(valor)) {
    valor = "'" + valor;
  }
  if (/[",\r\n]/.test(valor)) {
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
  const filas = applications.map((a) => {
    const { titulo, empresa } = datosDeLaOferta(a);
    return [
      celda(titulo),
      celda(empresa ?? ""),
      celda(a.jobOffer.platform.nombre),
      celda(fraseEstado(a.estadoActual)),
      celda(a.enviadaEn.toISOString().slice(0, 10)),
      // docs/revision-2026-09-28.md §1: el match de ESTA postulación, no el
      // último que alguien le calculó a la oferta compartida.
      celda(a.relevanciaAi != null ? String(Math.round(a.relevanciaAi)) : ""),
    ].join(",");
  });

  // BOM al inicio para que Excel en Windows detecte UTF-8 y no rompa las tildes.
  const csv = "﻿" + [encabezado.join(","), ...filas].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="postulaciones-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
