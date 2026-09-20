import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import { ProveedorAvisos } from "@/components/Avisos";
import "./globals.css";

// Archivo variable con el eje de ancho: los titulares van en expandido
// (wdth 112) y pesan 800 -- se leen timbrados, como el encabezado de un
// formulario. Inter queda para todo el texto corrido.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://autopostula.cl"),
  title: {
    default: "AutoPostula",
    template: "%s · AutoPostula",
  },
  description:
    "AutoPostula revisa las ofertas de Computrabajo, Laborum y Trabajando.com, deja fuera las que no calzan contigo y responde los formularios con tu experiencia real y tus palabras.",
  openGraph: {
    title: "AutoPostula",
    description:
      "Postula a lo que te sirve. Escribe una sola vez. Revisa las ofertas de Computrabajo, Laborum y Trabajando.com y responde los formularios por ti.",
    locale: "es_CL",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`${archivo.variable} ${inter.variable}`}>
      <body>
        <ProveedorAvisos>{children}</ProveedorAvisos>
      </body>
    </html>
  );
}
