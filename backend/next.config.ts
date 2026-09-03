import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  // pdfjs-dist (usado por pdf-parse) carga pdf.worker.mjs con un import()
  // dinámico en vez de uno estático -- Vercel no lo detecta solo al armar la
  // función serverless y en producción tira "Cannot find module
  // .../pdf.worker.mjs". Se fuerza a incluirlo acá.
  outputFileTracingIncludes: {
    "/api/cv/upload": ["./node_modules/pdfjs-dist/legacy/build/**/*"],
  },
};

export default nextConfig;
