// URL pública de la app, para armar enlaces que se mandan por fuera del
// navegador (correos, callbacks). No se deriva del request: el header Host es
// falsificable, y un atacante podría hacer que el correo de recuperación
// apunte a su dominio con un token válido adentro.
function normalizar(url: string): string {
  // AUTH_URL puede venir con path (ej. https://app.com/api/auth) -- nos
  // quedamos solo con el origen.
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).origin;
  } catch {
    return "";
  }
}

export function getBaseUrl(): string {
  const candidatos = [
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    // Las setea Vercel sola. La de producción es el dominio estable; VERCEL_URL
    // es la del deploy puntual y sirve para previews.
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ];

  for (const candidato of candidatos) {
    if (!candidato) continue;
    const origen = normalizar(candidato);
    if (origen) return origen;
  }

  return `http://localhost:${process.env.PORT || 3000}`;
}
