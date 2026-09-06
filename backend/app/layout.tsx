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
    "AutoPostula lee tu CV, aprende cómo escribes y responde los formularios de Computrabajo y Laborum con tus palabras. Postula 80 veces al mes escribiendo una sola.",
  openGraph: {
    title: "AutoPostula",
    description:
      "Postula 80 veces al mes. Escribe una sola. Autorrelleno con IA para Computrabajo y Laborum.",
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
