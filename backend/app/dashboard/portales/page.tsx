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
    <div style={{ maxWidth: 560, margin: "80px auto" }}>
      <h1>Portales conectados</h1>
      <p>
        {activasCount} activo(s)
        {maxActivas ? ` de ${maxActivas} permitidos en tu plan` : " (ilimitado)"}
      </p>

      {mensaje && <p style={{ color: "red" }}>{mensaje}</p>}

      <ul style={{ padding: 0, listStyle: "none" }}>
        {plataformas.map((p) => {
          const cuenta = cuentas.find((c) => c.platformId === p.id);
          return (
            <li key={p.id} style={{ marginBottom: 8 }}>
              {p.nombre} —{" "}
              {cuenta?.activa ? (
                <button onClick={() => desconectar(p.id)}>Desconectar</button>
              ) : (
                <button onClick={() => conectar(p.id)}>Conectar</button>
              )}
            </li>
          );
        })}
      </ul>

      <h2 style={{ marginTop: 32 }}>Token de la extensión</h2>
      <p>Copia este token en la configuración de la extensión para que pueda enviar tus postulaciones.</p>
      <code
        style={{
          display: "block",
          padding: 12,
          background: "#eee",
          wordBreak: "break-all",
        }}
      >
        {token ?? "Todavía no tienes un token"}
      </code>
      <button onClick={regenerarToken} style={{ marginTop: 8, padding: 8 }}>
        {token ? "Regenerar token" : "Generar token"}
      </button>

      <p style={{ marginTop: 24 }}>
        <a href="/dashboard">Volver al dashboard</a>
      </p>
    </div>
  );
}
