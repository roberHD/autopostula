import { auth, cuentaDeLaSesion } from "@/auth";

// Auth.js firma la sesión con el userId adentro del JWT — si la base de datos
// se resetea/migra (local, o al cambiar de ambiente) pero el navegador sigue
// con una sesión vieja, auth() devuelve igual un userId "válido" aunque esa
// fila ya no exista, y cualquier query que dependa de ese usuario revienta
// con un error crudo de Prisma (foreign key / record not found) en vez de un
// error entendible. Esto lo detecta antes de tocar la base.
export async function getUsuarioSesion() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return { userId: null, error: "No autenticado" as const };

  // La misma lectura (recordada unos segundos) que ya hizo auth() para ver si
  // la sesión sigue valiendo (docs/optimizacion-2026-09-29.md §4).
  const existe = await cuentaDeLaSesion(userId);
  if (!existe) {
    return {
      userId: null,
      error: "Tu sesión ya no es válida (posiblemente cambió el ambiente) — cierra sesión y vuelve a entrar." as const,
    };
  }

  return { userId, error: null };
}
