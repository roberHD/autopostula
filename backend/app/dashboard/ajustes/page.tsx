"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Mail, BadgeCheck, TriangleAlert, LogOut, LifeBuoy, ChevronRight } from "lucide-react";
import { textoPruebaEnCurso } from "@/lib/texto-rafaga";
import { PRUEBA_TOTAL } from "@/lib/estado-automatico";
import ComoTrabaja from "./ComoTrabaja";

export default function AjustesPage() {
  const router = useRouter();
  // "Hay algo automático que pausar": el plan Premium, o la prueba de una cuenta
  // gratis mientras dura (docs/rafagas-y-ponerse-al-dia.md §4.1). Con la prueba
  // gastada, el ajuste se ofrece como parte de un plan superior.
  const [disponibleEnPlan, setDisponibleEnPlan] = useState(false);
  const [pruebaRestantes, setPruebaRestantes] = useState<number | null>(null);
  const [planNombre, setPlanNombre] = useState<string | null>(null);
  const [esPremium, setEsPremium] = useState(false);
  // docs/pase-prepagado.md §6: hasta cuándo llega el Premium (ISO), o null.
  const [premiumHasta, setPremiumHasta] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");

  const [mostrarEliminar, setMostrarEliminar] = useState(false);
  const [confirmacionEmail, setConfirmacionEmail] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");

  async function cargar() {
    try {
      const res = await fetch("/api/account/busqueda-automatica");
      const data = await res.json();
      if (!res.ok) { setMensaje(data.error ?? `Error ${res.status}`); return; }
      setDisponibleEnPlan(data.modo ? data.modo !== "manual" : data.disponibleEnPlan);
      setPruebaRestantes(data.modo === "prueba" ? data.pruebaRestantes ?? null : null);
      setPlanNombre(data.planNombre);
      setEsPremium(data.esPremium ?? false);
      setPremiumHasta(data.premiumHasta ?? null);
      setEmail(data.email);
    } catch (err) {
      console.error("Error cargando ajustes:", err);
      setMensaje("No se pudo cargar — revisa la consola");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function eliminarCuenta() {
    if (eliminando) return;
    setErrorEliminar("");
    if (!email || confirmacionEmail.trim().toLowerCase() !== email.toLowerCase()) {
      setErrorEliminar("Escribe tu correo exactamente como aparece arriba para confirmar.");
      return;
    }
    setEliminando(true);
    try {
      const res = await fetch("/api/account/eliminar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacionEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorEliminar(data.error ?? "No se pudo eliminar la cuenta — intenta de nuevo");
        setEliminando(false);
        return;
      }
      await signOut({ callbackUrl: "/login?eliminada=1" });
    } catch (err) {
      console.error("Error eliminando cuenta:", err);
      setErrorEliminar("No se pudo eliminar la cuenta — revisa la consola");
      setEliminando(false);
    }
  }

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Ajustes</h1>
        <p className="ap-page-sub">Preferencias de tu cuenta.</p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0s" }}>
        <p className="ap-section-title">Tu cuenta</p>
        {cargando ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Cargando...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "var(--bg-elevated-2)", color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Mail size={15} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Correo</p>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{email ?? "—"}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "color-mix(in oklch, var(--chart-4) 16%, transparent)", color: "var(--chart-4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <BadgeCheck size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Plan actual</p>
                <p style={{ fontSize: 13, fontWeight: 500 }}>
                  {esPremium && premiumHasta
                    ? `Premium hasta el ${new Date(premiumHasta).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}`
                    : planNombre ?? "Plan gratuito"}
                </p>
              </div>
              {/* §5.4: ya no hay suscripción que cancelar -- el pase dura lo que se
                  compró y no se renueva solo. Acá solo se renueva o se compra. */}
              <button
                className={esPremium ? "ap-button-ghost" : "ap-button"}
                onClick={() => router.push("/dashboard/premium")}
              >
                {esPremium ? "Renovar" : "Pasar a Premium"}
              </button>
            </div>

            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                paddingTop: 12, borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "var(--bg-elevated-2)", color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <LogOut size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>Cerrar sesión</p>
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                  Sales de AutoPostula en este dispositivo. Tu cuenta y tus postulaciones quedan intactas.
                </p>
              </div>
              <button
                className="ap-button-ghost"
                style={{ flexShrink: 0 }}
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>

      {/* docs/estrategia-y-rediseno.md §6: un solo estado, acá y en el popup.
          El texto de la pausa cambia con el plan -- lo que se deja de hacer al
          pausar no es lo mismo en Premium que en una cuenta gratis. */}
      {!cargando && (
        <ComoTrabaja
          textoPausa={
            pruebaRestantes !== null
              ? `${textoPruebaEnCurso(pruebaRestantes, PRUEBA_TOTAL)}. Se envían solas, sin que entres a ningún portal.`
              : disponibleEnPlan
              ? "Se pone al día sola cada vez que abres tu computador: revisa las ofertas nuevas de tus portales y postula por ti."
              : "Entras a Computrabajo, Laborum o Trabajando y la extensión postula por ti mientras estás ahí."
          }
        />
      )}

      <div
        className="ap-section ap-animate-in"
        style={{ animationDelay: "0.1s", cursor: "pointer" }}
        role="link"
        tabIndex={0}
        onClick={() => router.push("/dashboard/contacto")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push("/dashboard/contacto");
          }
        }}
      >
        <p className="ap-section-title">Soporte</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: "var(--accent-soft)", color: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <LifeBuoy size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Contáctanos</p>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
              ¿Algo falla o tienes una idea? Escríbenos y adjunta una captura o un PDF.
            </p>
          </div>
          <span
            className="ap-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}
          >
            Escribirnos <ChevronRight size={14} />
          </span>
        </div>
      </div>

      <div
        className="ap-section ap-animate-in"
        style={{ animationDelay: "0.1s", borderColor: "color-mix(in oklch, var(--status-rechazado) 35%, transparent)" }}
      >
        <p className="ap-section-title" style={{ color: "var(--status-rechazado)" }}>Zona de peligro</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Eliminar mi cuenta</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
              Borra tu cuenta y todos tus datos (CV, perfil, postulaciones, preferencias) de inmediato. No se puede deshacer.
            </p>
          </div>
          <button
            style={{
              border: "1px solid var(--status-rechazado)", color: "var(--status-rechazado)",
              background: "transparent", borderRadius: 8, padding: "8px 14px",
              fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
            }}
            onClick={() => { setMostrarEliminar(true); setConfirmacionEmail(""); setErrorEliminar(""); }}
          >
            Eliminar mi cuenta
          </button>
        </div>
      </div>

      {mostrarEliminar && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "color-mix(in oklch, black 45%, transparent)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={() => !eliminando && setMostrarEliminar(false)}
        >
          <div
            className="ap-section"
            style={{ maxWidth: 420, width: "100%", margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "color-mix(in oklch, var(--status-rechazado) 16%, transparent)", color: "var(--status-rechazado)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <TriangleAlert size={16} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700 }}>¿Eliminar tu cuenta?</p>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                  Se borra todo de inmediato: CV, perfil de estilo, historial de postulaciones, portales conectados y tu suscripción (si tienes una activa se cancela). No hay vuelta atrás.
                </p>
              </div>
            </div>

            <label className="ap-label" style={{ marginTop: 8, display: "block" }}>
              Escribe <strong>{email}</strong> para confirmar
            </label>
            <input
              className="ap-input"
              value={confirmacionEmail}
              onChange={(e) => setConfirmacionEmail(e.target.value)}
              placeholder={email ?? ""}
              autoFocus
              disabled={eliminando}
            />
            {errorEliminar && (
              <p style={{ fontSize: 12, color: "var(--status-rechazado)", marginTop: 8 }}>{errorEliminar}</p>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="ap-button-ghost" disabled={eliminando} onClick={() => setMostrarEliminar(false)}>
                Cancelar
              </button>
              <button
                style={{
                  border: "none", background: "var(--status-rechazado)", color: "white",
                  borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600,
                  cursor: eliminando ? "default" : "pointer", opacity: eliminando ? 0.7 : 1,
                }}
                disabled={eliminando || !confirmacionEmail}
                onClick={eliminarCuenta}
              >
                {eliminando ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
