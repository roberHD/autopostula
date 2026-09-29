import type { NextConfig } from "next";

// docs/revision-2026-09-28.md §21: cabeceras de seguridad. Antes no había
// ninguna: otro sitio podía mostrar el panel dentro de un iframe (clickjacking)
// y no había política de contenido.
//
// La CSP solo va en producción: `next dev` necesita eval para recargar en
// caliente. Next mete scripts en línea para hidratar la página, por eso
// 'unsafe-inline' en script-src (sin nonces por ahora); igual deja fuera
// scripts de otros dominios, iframes, <object> y un <base> inyectado. El sitio
// no carga nada de afuera: fuentes, imágenes y todo lo demás sale del propio
// dominio (next/font las sirve desde acá).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // blob: para la vista previa de las capturas adjuntas en Contacto.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  // Sin upgrade-insecure-requests: Vercel ya manda HSTS, y con eso probar el
  // build de producción en http://localhost se rompía.
].join("; ");

const cabecerasDeSeguridad = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // El micrófono lo usa el dictado del panel (lib/usar-dictado.ts); lo demás no se usa.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  // pdfjs-dist (usado por pdf-parse) carga pdf.worker.mjs con un import()
  // dinámico en vez de uno estático -- Vercel no lo detecta solo al armar la
  // función serverless y en producción tira "Cannot find module
  // .../pdf.worker.mjs". Se fuerza a incluirlo acá.
  outputFileTracingIncludes: {
    "/api/cv/upload": ["./node_modules/pdfjs-dist/legacy/build/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecerasDeSeguridad }];
  },
};

export default nextConfig;
