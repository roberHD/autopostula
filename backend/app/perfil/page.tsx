import { redirect } from "next/navigation";

// §5 (docs/revision-2026-09-16.md): esta era una página vieja, fuera de
// /dashboard y con estilos por defecto. El perfil vive en /dashboard/perfil; se
// deja la ruta solo para que los enlaces y marcadores viejos no den 404.
export default function PerfilPage() {
  redirect("/dashboard/perfil");
}
