import { auth, signOut } from "../../auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div style={{ maxWidth: 480, margin: "80px auto" }}>
      <h1>Hola, {session.user.name ?? session.user.email}</h1>
      <p>Sesión activa. Rol: {(session.user as any).rol ?? "usuario"}</p>

      <p style={{ marginBottom: 16 }}>
        <a href="/dashboard/cv">Subir / actualizar mi CV</a>
      </p>

      <p style={{ marginBottom: 16 }}>
        <a href="/dashboard/portales">Conectar portales / token de extensión</a>
      </p>

      <p style={{ marginBottom: 16 }}>
        <a href="/dashboard/historial">Ver historial de postulaciones</a>
      </p>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" style={{ padding: 10 }}>
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
