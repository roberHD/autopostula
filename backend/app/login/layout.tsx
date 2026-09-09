import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entra a tu cuenta",
  description:
    "Entra a AutoPostula y revisa en qué quedó cada postulación: enviada, vista, en proceso o finalista.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
