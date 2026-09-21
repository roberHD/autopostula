import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crea una contraseña nueva",
  description:
    "Elige la contraseña con la que vas a entrar a AutoPostula.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
