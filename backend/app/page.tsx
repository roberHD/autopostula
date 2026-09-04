import type { Metadata } from "next";
import Link from "next/link";
import { Zap, FileText, LineChart, Puzzle, Check } from "lucide-react";

export const metadata: Metadata = {
  title: "AutoPostula — Postula a más empleos, con menos esfuerzo",
  description:
    "AutoPostula usa IA para rellenar y enviar tus postulaciones en Computrabajo y Laborum, con respuestas que suenan a ti. Sube tu CV una vez y postula en segundos.",
};

// Mismos tokens que /login y /registro -- no se tocan, para que las tres
// pantallas públicas se sientan como una sola experiencia.
const ACCENT = "oklch(0.53 0.2 280)";
const ACCENT_SOFT = "oklch(0.53 0.2 280 / 10%)";
const BG = "oklch(0.985 0.003 275)";
const BORDER = "oklch(0.91 0.008 275)";
const TEXT = "oklch(0.22 0.01 275)";
const TEXT_MUTED = "oklch(0.52 0.02 275)";

const CARACTERISTICAS = [
  {
    Icon: Zap,
    titulo: "Autorrelleno con IA",
    desc: "Completa los formularios de postulación de Computrabajo, Laborum y más, en segundos.",
  },
  {
    Icon: FileText,
    titulo: "Respuestas cercanas a ti",
    desc: "La IA responde con tu CV, tu perfil y tu forma real de escribir -- no genéricas, no repetidas.",
  },
  {
    Icon: LineChart,
    titulo: "Todo en un dashboard",
    desc: "Postulaciones, estados y analíticas centralizadas, sin perder el hilo de a qué le postulaste.",
  },
  {
    Icon: Puzzle,
    titulo: "Filtros a tu medida",
    desc: "Vos decides qué ofertas te interesan -- rubro, jornada, modalidad -- y la extensión se encarga del resto.",
  },
];

const PASOS = [
  { numero: "1", titulo: "Sube tu CV", desc: "Lo leemos una vez y armamos tu perfil -- experiencia, habilidades, forma de escribir." },
  { numero: "2", titulo: "Instala la extensión", desc: "Conecta tu cuenta de Computrabajo y/o Laborum en un clic." },
  { numero: "3", titulo: "Postula en segundos", desc: "La IA rellena cada formulario con respuestas reales, tuyas -- revisa o postula directo." },
];

export default function LandingPage() {
  return (
    <div style={{ background: BG, color: TEXT, minHeight: "100vh" }}>
      {/* En pantallas angostas se esconden los anchors de sección -- si no, el
          nav completo no entra en una fila y desborda horizontalmente toda la
          página (bug real que se encontró probando esto en 375px). */}
      <style>{`
        @media (max-width: 560px) {
          .ap-landing-anchor { display: none; }
        }
      `}</style>
      {/* ── Header ── */}
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          maxWidth: 1100, margin: "0 auto", padding: "20px 16px", gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: ACCENT, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13,
            }}
          >
            AP
          </div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>AutoPostula</span>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "nowrap", minWidth: 0 }}>
          <a href="#como-funciona" className="ap-landing-anchor" style={{ fontSize: 13.5, color: TEXT_MUTED, textDecoration: "none", whiteSpace: "nowrap" }}>
            Cómo funciona
          </a>
          <a href="#precios" className="ap-landing-anchor" style={{ fontSize: 13.5, color: TEXT_MUTED, textDecoration: "none", whiteSpace: "nowrap" }}>
            Precios
          </a>
          <Link href="/login" style={{ fontSize: 13.5, color: TEXT, textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            style={{
              fontSize: 13.5, fontWeight: 600, color: "#fff", background: ACCENT,
              padding: "9px 14px", borderRadius: 8, textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Regístrate
          </Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 780, margin: "0 auto", padding: "64px 24px 56px", textAlign: "center" }}>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, lineHeight: 1.15, marginBottom: 18 }}>
          Postula a más empleos,
          <br />
          con menos esfuerzo.
        </h1>
        <p style={{ fontSize: 17, color: TEXT_MUTED, lineHeight: 1.6, maxWidth: 560, margin: "0 auto 32px" }}>
          AutoPostula sube tu CV una vez y deja que la IA rellene y envíe tus postulaciones en
          Computrabajo y Laborum, con respuestas que suenan a ti -- no genéricas.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/registro"
            style={{
              fontSize: 14.5, fontWeight: 600, color: "#fff", background: ACCENT,
              padding: "13px 24px", borderRadius: 10, textDecoration: "none",
            }}
          >
            Empezar gratis
          </Link>
          <a
            href="#como-funciona"
            style={{
              fontSize: 14.5, fontWeight: 600, color: TEXT, background: "transparent",
              border: `1px solid ${BORDER}`, padding: "13px 24px", borderRadius: 10, textDecoration: "none",
            }}
          >
            Ver cómo funciona
          </a>
        </div>
      </section>

      {/* ── Características ── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 64px" }}>
        <div
          style={{
            display: "grid", gap: 20,
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          }}
        >
          {CARACTERISTICAS.map(({ Icon, titulo, desc }) => (
            <div
              key={titulo}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22, background: "#fff" }}
            >
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, marginBottom: 14,
                  background: ACCENT_SOFT, color: ACCENT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Icon size={17} />
              </div>
              <p style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>{titulo}</p>
              <p style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.55 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section id="como-funciona" style={{ background: "#fff", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", marginBottom: 44 }}>Cómo funciona</h2>
          <div style={{ display: "grid", gap: 32, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {PASOS.map(({ numero, titulo, desc }) => (
              <div key={numero} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 40, height: 40, borderRadius: "50%", margin: "0 auto 16px",
                    background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 15,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {numero}
                </div>
                <p style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>{titulo}</p>
                <p style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.55, maxWidth: 260, margin: "0 auto" }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Precios ── */}
      <section id="precios" style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", marginBottom: 10 }}>Precios simples</h2>
        <p style={{ fontSize: 14, color: TEXT_MUTED, textAlign: "center", marginBottom: 40 }}>
          Empieza gratis. Pasa a Premium cuando quieras postular sin límites.
        </p>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, background: "#fff" }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: TEXT_MUTED, marginBottom: 4 }}>Gratis</p>
            <p style={{ fontSize: 32, fontWeight: 800, marginBottom: 18 }}>$0</p>
            {[
              "20 postulaciones al mes",
              "1 portal conectado a la vez",
              "Postulación manual asistida por IA",
            ].map((item) => (
              <div key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                <Check size={15} color={TEXT_MUTED} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div
            style={{
              border: `2px solid ${ACCENT}`, borderRadius: 16, padding: 28, background: "#fff",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute", top: -11, right: 20, background: ACCENT, color: "#fff",
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              }}
            >
              Recomendado
            </span>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT, marginBottom: 4 }}>Premium</p>
            <p style={{ fontSize: 32, fontWeight: 800, marginBottom: 18 }}>
              $3.990 <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_MUTED }}>/mes</span>
            </p>
            {[
              "80 postulaciones al mes",
              "Todos tus portales conectados a la vez",
              "Búsqueda y postulación automática",
              "Perfil dinámico e instrucciones personalizadas",
            ].map((item) => (
              <div key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                <Check size={15} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section style={{ background: ACCENT, color: "#fff", padding: "56px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Deja de llenar formularios a mano.</h2>
        <p style={{ fontSize: 14.5, opacity: 0.85, marginBottom: 24 }}>Crea tu cuenta gratis y postula a tu primera oferta en minutos.</p>
        <Link
          href="/registro"
          style={{
            display: "inline-block", fontSize: 14.5, fontWeight: 700, color: ACCENT, background: "#fff",
            padding: "13px 28px", borderRadius: 10, textDecoration: "none",
          }}
        >
          Empezar gratis
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5, color: TEXT_MUTED }}>© {new Date().getFullYear()} AutoPostula</span>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="/terminos" style={{ fontSize: 12.5, color: TEXT_MUTED, textDecoration: "none" }}>
            Términos y condiciones
          </Link>
          <Link href="/privacidad" style={{ fontSize: 12.5, color: TEXT_MUTED, textDecoration: "none" }}>
            Privacidad
          </Link>
        </div>
      </footer>
    </div>
  );
}
