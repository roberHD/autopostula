import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recupera tu contraseña",
  description:
    "Te mandamos un enlace a tu correo para crear una contraseña nueva.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
