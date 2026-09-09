import type { MetadataRoute } from "next";

const SITIO = "https://autopostula.cl";

/**
 * Qué puede indexar Google.
 *
 * Todo lo que hay detrás de la sesión queda fuera: el tablero muestra datos
 * de una persona concreta, y /api son respuestas JSON que no tienen ningún
 * sentido en resultados de búsqueda. Sin esto, ambos quedaban abiertos.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/dashboard/", "/onboarding", "/api/", "/reset-password"],
    },
    sitemap: `${SITIO}/sitemap.xml`,
  };
}
