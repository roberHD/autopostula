import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Configura tu cuenta",
  description:
    "Sube tu CV, conecta un portal y define qué ofertas te sirven.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
