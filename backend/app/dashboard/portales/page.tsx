"use client";

import { useEffect, useState } from "react";

type Plataforma = { id: string; nombre: string };
type Cuenta = { id: string; platformId: string; activa: boolean };

export default function PortalesPage() {
  const [plataformas, setPlataformas] = useState<Plataforma[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [maxActivas, setMaxActivas] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");

  async function cargar() {
    try {
      const res = await fetch("/api/platform-accounts");
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status} al cargar portales`);
        return;
      }
      setPlataformas(data.plataformas ?? []);
      setCuentas(data.cuentas ?? []);
      setMaxActivas(data.maxPlataformasActivas ?? null);
    } catch (err) {
      console.error("Error cargando portales:", err);
      setMensaje("No se pudo cargar la lista de portales — revisa la consola");
    }
  }

  async function cargarToken() {
    try {
      const res = await fetch("/api/account/token");
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status} al cargar el token`);
        return;
      }
      setToken(data.apiToken);
    } catch (err) {
      console.error("Error cargando token:", err);
      setMensaje("No se pudo cargar el token — revisa la consola");
    }
  }

  useEffect(() => {
    cargar();
    cargarToken();
  }, []);

  async function conectar(platformId: string) {
    setMensaje("");
    const res = await fetch("/api/platform-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMensaje(data.error ?? "No se pudo conectar");
      return;
    }
    cargar();
  }

  async function desconectar(platformId: string) {
    await fetch("/api/platform-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId }),
    });
    cargar();
  }

  async function regenerarToken() {
    setMensaje("");
    try {
      const res = await fetch("/api/account/token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status} al generar el token`);
        return;
      }
      setToken(data.apiToken);
    } catch (err) {
      console.error("Error generando token:", err);
      setMensaje("No se pudo generar el token — revisa la consola");
    }
  }

  const activasCount = cuentas.filter((c) => c.activa).length;

  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Portales conectados</h1>
        <p className="ap-page-sub">
          {activasCount} activo(s){maxActivas ? ` de ${maxActivas} permitidos en tu plan` : " (ilimitado)"}
        </p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}

      <div className="ap-section">
        <p className="ap-section-title">Portales disponibles</p>
        <p className="ap-section-sub">Conecta los portales donde quieres que la extensión postule por ti</p>

        {plataformas.map((p) => {
          const cuenta = cuentas.find((c) => c.platformId === p.id);
          return (
            <div key={p.id} className="ap-toggle-row">
              <div>
                <div className="ap-toggle-label" style={{ fontWeight: 600 }}>{p.nombre}</div>
                <div className="ap-toggle-desc">
                  {cuenta?.activa ? "Conectado" : "No conectado"}
                </div>
              </div>
              {cuenta?.activa ? (
                <button className="ap-button-ghost" onClick={() => desconectar(p.id)}>
                  Desconectar
                </button>
              ) : (
                <button className="ap-button" onClick={() => conectar(p.id)}>
                  Conectar
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="ap-section">
        <p className="ap-section-title">Token de la extensión</p>
        <p className="ap-section-sub">
          Copia este token en la configuración de la extensión para habilitar la IA y el historial.
        </p>
        <code
          style={{
            display: "block",
            padding: "12px 14px",
            background: "var(--bg-elevated-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            wordBreak: "break-all",
            fontSize: 12.5,
            color: "var(--text)",
            marginBottom: 12,
          }}
        >
          {token ?? "Todavía no tienes un token"}
        </code>
        <button className="ap-button" onClick={regenerarToken}>
          {token ? "Regenerar token" : "Generar token"}
        </button>
      </div>
    </>
  );
}
