"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

// "Actividad de la semana" de la página Hoy. Vive en su propio archivo para que
// recharts (la librería más pesada del panel) se baje aparte, después de que
// el resto de la página ya se ve (docs/optimizacion-2026-09-29.md §2).
export default function GraficoActividad({ datos }: { datos: { etiqueta: string; enviadas: number; respuestas: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gEnviadas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gRespuestas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)", fontSize: 12 }}
          labelStyle={{ color: "var(--text)", fontWeight: 600 }}
        />
        <Area type="monotone" dataKey="enviadas" name="Enviadas" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gEnviadas)" animationDuration={900} />
        <Area type="monotone" dataKey="respuestas" name="Respuestas" stroke="var(--chart-2)" strokeWidth={2} fill="url(#gRespuestas)" animationDuration={900} animationBegin={150} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
