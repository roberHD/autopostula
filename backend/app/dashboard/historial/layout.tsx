import type { Metadata } from "next";

// docs/revision-2026-09-28.md: todas las páginas del panel se llamaban "Tu
// tablero" en la pestaña del navegador, y no se distinguían entre sí.
export const metadata: Metadata = { title: "Postulaciones" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
