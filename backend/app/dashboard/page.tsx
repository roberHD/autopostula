import { auth, signOut } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  const enlaces = [
    { href: "/dashboard/historial", titulo: "Historial", desc: "Todas tus postulaciones y su estado" },
    { href: "/dashboard/cv", titulo: "CV", desc: "Sube o actualiza tu CV" },
    { href: "/dashboard/portales", titulo: "Portales", desc: "Conecta portales y tu token de extensión" },
    { href: "/dashboard/perfil/calibracion", titulo: "Calibración", desc: "Ajusta tu estilo de escritura" },
  ];

  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">
          Hola, {session?.user?.name ?? session?.user?.email}
        </h1>
        <p className="ap-page-sub">Rol: {(session?.user as any)?.rol ?? "usuario"}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {enlaces.map((e) => (
          <a
            key={e.href}
            href={e.href}
            className="ap-card"
            style={{ display: "block", padding: 16, textDecoration: "none", color: "var(--text)" }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{e.titulo}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{e.desc}</div>
          </a>
        ))}
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        style={{ marginTop: 24 }}
      >
        <button
          type="submit"
          style={{
            padding: 10,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </form>
    </>
  );
}
