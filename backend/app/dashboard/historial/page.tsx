"use client";

import { useEffect, useState } from "react";

type Application = {
  id: string;
  titulo: string;
  empresa: string | null;
  portal: string;
  estado: string;
  enviadaEn: string;
};

const COLOR_ESTADO: Record<string, string> = {
  ENVIADO: "#6b7280",
  VISTO: "#2563eb",
  EN_PROCESO: "#d97706",
  FINALIZADO: "#16a34a",
  RECHAZADO: "#dc2626",
};

export default function HistorialPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/applications");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status} al cargar el historial`);
          return;
        }
        setApplications(data.applications ?? []);
      } catch (err) {
        console.error("Error cargando historial:", err);
        setMensaje("No se pudo cargar el historial — revisa la consola");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "80px auto" }}>
      <h1>Historial de postulaciones</h1>

      {mensaje && <p style={{ color: "red" }}>{mensaje}</p>}
      {cargando && <p>Cargando...</p>}

      {!cargando && applications.length === 0 && !mensaje && (
        <p>Todavía no hay postulaciones registradas.</p>
      )}

      {applications.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: 8 }}>Título</th>
              <th style={{ padding: 8 }}>Empresa</th>
              <th style={{ padding: 8 }}>Portal</th>
              <th style={{ padding: 8 }}>Estado</th>
              <th style={{ padding: 8 }}>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{a.titulo}</td>
                <td style={{ padding: 8 }}>{a.empresa ?? "—"}</td>
                <td style={{ padding: 8 }}>{a.portal}</td>
                <td style={{ padding: 8 }}>
                  <span
                    style={{
                      color: COLOR_ESTADO[a.estado] ?? "#374151",
                      fontWeight: 600,
                    }}
                  >
                    {a.estado}
                  </span>
                </td>
                <td style={{ padding: 8 }}>
                  {new Date(a.enviadaEn).toLocaleDateString("es-CL")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: 24 }}>
        <a href="/dashboard">Volver al dashboard</a>
      </p>
    </div>
  );
}
