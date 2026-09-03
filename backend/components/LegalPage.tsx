import Link from "next/link";

// Shell compartido por /privacidad y /terminos. Estas páginas son públicas y
// viven fuera de /dashboard, así que no reciben theme.css — usan la misma
// paleta inline que /login y /registro para no depender de ese import.
const ACCENT = "oklch(0.53 0.2 280)";
const BG = "oklch(0.985 0.003 275)";
const BORDER = "oklch(0.91 0.008 275)";
const TEXT = "oklch(0.25 0.02 275)";
const TEXT_MUTED = "oklch(0.52 0.02 275)";

export function LegalPage({
  titulo,
  actualizado,
  children,
}: {
  titulo: string;
  actualizado: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT }}>
      <header
        style={{
          borderBottom: `1px solid ${BORDER}`,
          background: "white",
          padding: "16px 24px",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Link
            href="/"
            style={{ color: ACCENT, fontWeight: 600, fontSize: 15, textDecoration: "none" }}
          >
            AutoPostula
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "48px 24px 80px",
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        <h1 style={{ fontSize: 30, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>
          {titulo}
        </h1>
        <p style={{ color: TEXT_MUTED, fontSize: 13, marginTop: 0, marginBottom: 40 }}>
          Última actualización: {actualizado}
        </p>

        <div className="legal-body">{children}</div>

        <footer
          style={{
            marginTop: 56,
            paddingTop: 24,
            borderTop: `1px solid ${BORDER}`,
            color: TEXT_MUTED,
            fontSize: 13,
            display: "flex",
            gap: 20,
          }}
        >
          <Link href="/privacidad" style={{ color: TEXT_MUTED }}>
            Política de privacidad
          </Link>
          <Link href="/terminos" style={{ color: TEXT_MUTED }}>
            Términos y condiciones
          </Link>
        </footer>
      </main>

      {/* Estilos del cuerpo del documento. Van acá y no en un .css aparte
          porque solo los usan estas dos páginas. */}
      <style>{`
        .legal-body h2 {
          font-size: 19px;
          font-weight: 650;
          letter-spacing: -0.01em;
          margin: 40px 0 12px;
        }
        .legal-body h3 {
          font-size: 15px;
          font-weight: 650;
          margin: 24px 0 6px;
        }
        .legal-body p { margin: 0 0 14px; }
        .legal-body ul { margin: 0 0 14px; padding-left: 22px; }
        .legal-body li { margin-bottom: 7px; }
        .legal-body a { color: ${ACCENT}; }
        .legal-body strong { font-weight: 650; }
        .legal-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 0 0 18px;
          font-size: 14px;
        }
        .legal-body th, .legal-body td {
          border: 1px solid ${BORDER};
          padding: 9px 12px;
          text-align: left;
          vertical-align: top;
        }
        .legal-body th { background: white; font-weight: 650; }
        .legal-body .nota {
          background: white;
          border: 1px solid ${BORDER};
          border-left: 3px solid ${ACCENT};
          border-radius: 6px;
          padding: 14px 16px;
          margin: 0 0 18px;
        }
        .legal-body .nota p:last-child { margin-bottom: 0; }
      `}</style>
    </div>
  );
}
