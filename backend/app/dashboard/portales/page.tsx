"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Eye, EyeOff, Copy, Check, RefreshCw, Plug, PlugZap } from "lucide-react";

type Plataforma = { id: string; nombre: string; urlBase: string };
type Cuenta = { id: string; platformId: string; activa: boolean; conectadaEn: string; postulaciones: number };

// Solo estilo (color + iniciales del badge) — no hay estos datos en la base
// porque son puramente visuales, no información real sobre el usuario.
const ESTILO_PORTAL: Record<string, { color: string; mono: string }> = {
  Computrabajo: { color: "#0057B8", mono: "CT" },
  Laborum: { color: "#7000C8", mono: "LB" },
};
const ESTILO_DEFAULT = { color: "var(--accent)", mono: "??" };

export default function PortalesPage() {
  const [plataformas, setPlataformas] = useState<Plataforma[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [maxActivas, setMaxActivas] = useState<number | null>(null);
  const [planNombre, setPlanNombre] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [revelado, setRevelado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);

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
      setPlanNombre(data.planNombre ?? null);
    } catch (err) {
      console.error("Error cargando portales:", err);
      setMensaje("No se pudo cargar la lista de portales — revisa la consola");
    } finally {
      setCargando(false);
    }
  }

  async function cargarToken() {
    try {
      const res = await fetch("/api/account/token");
      const data = await res.json();
      if (res.ok) setToken(data.apiToken);
    } catch (err) {
      console.error("Error cargando token:", err);
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

  async function copiarToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // ignore
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  const activasCount = cuentas.filter((c) => c.activa).length;
  const pct = maxActivas ? Math.min(100, Math.round((activasCount / maxActivas) * 100)) : 0;
  const masked = token ? `${token.slice(0, 6)}${"•".repeat(20)}${token.slice(-4)}` : "";

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Portales conectados</h1>
        <p className="ap-page-sub">
          Conecta los portales donde quieres que la extensión postule por ti. La IA usará tu perfil para completar cada formulario automáticamente.
        </p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}

      {/* Uso del plan */}
      <div
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16,
          background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
          padding: 18, marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: "var(--accent)", color: "var(--accent-contrast)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ShieldCheck size={19} />
          </div>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 600 }}>{planNombre ?? "Plan gratuito"}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {activasCount} de {maxActivas ?? "∞"} {maxActivas === null ? "portales (ilimitado)" : "portales activos"}
            </p>
          </div>
        </div>
        {maxActivas != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: 220, maxWidth: "100%" }}>
            <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: pct + "%", background: "var(--accent)", transition: "width .4s" }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", flexShrink: 0 }}>
              {activasCount}/{maxActivas}
            </span>
          </div>
        )}
      </div>

      {/* Grid de portales */}
      <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Portales disponibles</p>
      {cargando ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Cargando...</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 24 }}>
          {plataformas.map((p) => {
            const cuenta = cuentas.find((c) => c.platformId === p.id);
            const conectado = !!cuenta?.activa;
            const estilo = ESTILO_PORTAL[p.nombre] ?? ESTILO_DEFAULT;
            let sitio = p.urlBase;
            try { sitio = new URL(p.urlBase).hostname; } catch {}

            return (
              <div
                key={p.id}
                style={{
                  display: "flex", flexDirection: "column", gap: 14,
                  background: "var(--bg-elevated)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", padding: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: estilo.color, color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12.5, fontWeight: 700,
                      }}
                    >
                      {estilo.mono}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre}</p>
                      <p style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sitio}</p>
                    </div>
                  </div>
                  <span
                    style={{
                      display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                      borderRadius: 999, padding: "3px 9px", fontSize: 10.5, fontWeight: 600,
                      background: conectado ? "color-mix(in oklch, var(--accent) 15%, transparent)" : "var(--bg-elevated-2)",
                      color: conectado ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: conectado ? "var(--accent)" : "var(--text-muted)" }} />
                    {conectado ? "Conectado" : "Desconectado"}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    {conectado && cuenta ? (
                      <>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{cuenta.postulaciones}</span> postulaciones · desde{" "}
                        {new Date(cuenta.conectadaEn).toLocaleDateString("es-CL")}
                      </>
                    ) : (
                      "Sin conectar"
                    )}
                  </p>
                  {conectado ? (
                    <button className="ap-button-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexShrink: 0 }} onClick={() => desconectar(p.id)}>
                      <Plug size={13} />
                      Desconectar
                    </button>
                  ) : (
                    <button className="ap-button" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexShrink: 0 }} onClick={() => conectar(p.id)}>
                      <PlugZap size={13} />
                      Conectar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Token de la extensión */}
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: 14,
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", padding: 18,
        }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: "var(--accent)", color: "var(--accent-contrast)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <KeyRound size={17} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600 }}>Token de la extensión</h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, marginBottom: 14, lineHeight: 1.5 }}>
            Normalmente no necesitas esto — la extensión se conecta sola desde el onboarding. Úsalo solo si tienes que reconectarla a mano.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div
              style={{
                flex: 1, minWidth: 220, display: "flex", alignItems: "center", gap: 8,
                border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px",
                background: "var(--bg-elevated-2)",
              }}
            >
              <code style={{ flex: 1, fontSize: 12, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {token ? (revelado ? token : masked) : "Todavía no tienes un token"}
              </code>
              {token && (
                <>
                  <button
                    onClick={() => setRevelado((v) => !v)}
                    aria-label={revelado ? "Ocultar token" : "Mostrar token"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0, display: "flex" }}
                  >
                    {revelado ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button
                    onClick={copiarToken}
                    aria-label="Copiar token"
                    style={{ background: "none", border: "none", cursor: "pointer", color: copiado ? "var(--accent)" : "var(--text-muted)", flexShrink: 0, display: "flex" }}
                  >
                    {copiado ? <Check size={15} strokeWidth={3} /> : <Copy size={15} />}
                  </button>
                </>
              )}
            </div>
            <button className="ap-button-ghost" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={regenerarToken}>
              <RefreshCw size={14} />
              {token ? "Regenerar" : "Generar token"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
