import type { Metadata } from "next";
import { POSTULACIONES_GRATIS_AL_MES } from "@/lib/plan-gratis";

export const metadata: Metadata = {
  title: "Crea tu cuenta gratis",
  description: `${POSTULACIONES_GRATIS_AL_MES} postulaciones gratis al mes, sin tarjeta. Sube tu CV y AutoPostula responde los formularios de Computrabajo, Laborum y Trabajando.com con tus palabras.`,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
