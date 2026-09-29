import type { Metadata } from "next";

// docs/revision-2026-09-28.md: todas las páginas del panel se llamaban "Tu
// tablero" en la pestaña del navegador, y no se distinguían entre sí. La
// plantilla se repite porque tiene subpáginas: con un título de texto plano,
// Next no le pone " · AutoPostula" a las de más abajo.
export const metadata: Metadata = { title: { default: "Tu plan", template: "%s · AutoPostula" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
