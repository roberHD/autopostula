import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recordatorios por correo",
  description: "Deja de recibir los recordatorios de AutoPostula, o vuelve a activarlos.",
  // Un enlace con firma de una persona: nada de indexarlo.
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
