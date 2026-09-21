import type { MetadataRoute } from "next";

const SITIO = "https://autopostula.cl";

/**
 * Solo las páginas públicas y estables. Login y registro quedan fuera a
 * propósito: son pantallas de acceso, no contenido que alguien deba
 * encontrar buscando en Google.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const hoy = new Date();

  return [
    { url: SITIO, lastModified: hoy, changeFrequency: "weekly", priority: 1 },
    { url: `${SITIO}/terminos`, lastModified: hoy, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITIO}/privacidad`, lastModified: hoy, changeFrequency: "yearly", priority: 0.3 },
  ];
}
