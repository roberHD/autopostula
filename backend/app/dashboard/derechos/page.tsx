import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { esAdmin } from "@/lib/derechos";
import AdminDerechos from "./AdminDerechos";

export const metadata: Metadata = { title: "Solicitudes de datos" };

// Para el equipo (cuentas ADMIN): las solicitudes de derechos sobre datos
// personales, para responderlas dentro del plazo legal (lib/derechos.ts). A
// cualquier otra cuenta le responde 404, como si no existiera.
export default async function DerechosPage() {
  const { userId } = await getUsuarioSesion();
  if (!userId || !(await esAdmin(userId))) notFound();
  return <AdminDerechos />;
}
