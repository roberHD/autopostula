import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crea tu cuenta gratis",
  description:
    "20 postulaciones gratis al mes, sin tarjeta. Sube tu CV y AutoPostula responde los formularios de Computrabajo, Laborum y Trabajando.com con tus palabras.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
