import { objetivosPermitenDirectivo } from "@/lib/nivel-cargo";
import { rolesPorAmplitud, type Amplitud, type ObjetivoParaAmplitud } from "@/lib/amplitud";
import { requisitosDelCandidato } from "@/lib/requisitos-cv";

/**
 * El perfil compilado tal como lo usa el scorer de la extensión: lo guardado
 * más lo que se resuelve en cada consulta. Lo arman /api/extension/perfil y
 * scripts/banco-de-casos.ts, que vuelve a correr el scorer con exactamente lo
 * que vería la extensión (docs/revision-scorer-2026-09-30.md §6).
 *
 * docs/amplitud-de-busqueda.md §4 y §5: la amplitud se resuelve en cada
 * consulta, por la misma razón que nivelDirectivo (§2.7) -- es una consulta
 * determinista al catálogo CIUO, no una llamada de IA. Así cambiar el selector
 * en el panel se refleja de inmediato, sin recompilar el perfil y sin gastarle
 * a la persona una llamada de su cupo mensual.
 */
export async function perfilParaElScorer(
  compilado: Record<string, unknown>,
  opciones: {
    objetivos: ObjetivoParaAmplitud[];
    amplitud: Amplitud;
    cv: Parameters<typeof requisitosDelCandidato>[0];
    // docs/revision-scorer-2026-09-30.md §7: el de la cuenta, si se ajustó.
    umbralPostular: number | null;
  }
): Promise<Record<string, unknown>> {
  const { objetivos, amplitud, cv, umbralPostular } = opciones;
  const rolesDeclarados: { canonico?: string; sinonimos?: string[] }[] = Array.isArray(compilado.roles)
    ? (compilado.roles as { canonico?: string; sinonimos?: string[] }[])
    : [];
  const rolesExtra = await rolesPorAmplitud(
    objetivos,
    amplitud,
    rolesDeclarados
      .flatMap((r) => [r?.canonico, ...(Array.isArray(r?.sinonimos) ? r.sinonimos : [])])
      .filter((t): t is string => !!t)
  );
  return {
    ...compilado,
    ...(umbralPostular != null ? { umbralPostular } : {}),
    nivelDirectivo: objetivosPermitenDirectivo(objetivos),
    amplitud,
    modo: amplitud === "abierto" ? "abierto" : "objetivo",
    roles: [...rolesDeclarados, ...rolesExtra],
    // §5: lo que el CV acredita. Solo lo usa el modo abierto, pero viaja
    // siempre: es barato y evita una consulta aparte del scorer.
    tiene: requisitosDelCandidato(cv),
  };
}
