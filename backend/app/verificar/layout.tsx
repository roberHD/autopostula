import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confirma tu correo",
  description: "Confirma tu correo para conectar la extensión de AutoPostula.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
