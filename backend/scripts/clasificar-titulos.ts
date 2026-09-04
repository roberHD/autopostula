import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma";
import { obtenerCandidatos, construirPrompt, parsearRespuesta, normalizar, type Candidato } from "../lib/clasificador-titulos";

// Job periódico (docs/rediseno-filtrado-ofertas.md §7.4, sugerido semanal):
// clasifica los TituloCanonico cosechados (§7.2) que todavía no tienen ciuo,
// contra el catálogo oficial, usando Opus 5 vía Batch API. Idempotente --
// solo toca filas con ciuo=null, así que correrlo de nuevo nunca reprocesa
// lo ya clasificado exitosamente.
//
// Uso manual: npx tsx scripts/clasificar-titulos.ts
//
// Nota conocida: una fila que el modelo marca "ninguno" queda con ciuo=null
// igual que una nunca procesada, así que HOY se reintenta en cada corrida
// (gasto pequeño pero no cero). Antes de correr esto en un cron real,
// conviene agregar una marca de "ya se intentó, no matcheó" para no pagar
// por reclasificar lo mismo cada semana -- no se agregó todavía porque no
// hay ningún título cosechado real aún (§7.2 recién empieza a llenarse).

const MODEL = "claude-opus-5";
const TAMANO_LOTE = 200;
const POLL_MS = 10_000;

type Pendiente = { id: string; formaLimpia: string };

async function clasificarLote(anthropic: Anthropic, filas: Pendiente[]) {
  const preparados = filas.map((fila) => {
    const candidatos = obtenerCandidatos(normalizar(fila.formaLimpia));
    const { system, user } = construirPrompt(fila.formaLimpia, candidatos);
    return {
      custom_id: fila.id,
      params: {
        model: MODEL,
        max_tokens: 300,
        system,
        messages: [{ role: "user" as const, content: user }],
      },
      candidatos,
    };
  });

  const batch = await anthropic.messages.batches.create({
    requests: preparados.map(({ custom_id, params }) => ({ custom_id, params })),
  });
  console.log(`  Lote de ${filas.length} enviado: ${batch.id}`);

  let estado = batch;
  while (estado.processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, POLL_MS));
    estado = await anthropic.messages.batches.retrieve(batch.id);
  }

  const candidatosPorId = new Map<string, Candidato[]>(preparados.map((p) => [p.custom_id, p.candidatos]));
  const stream = await anthropic.messages.batches.results(batch.id);

  let clasificados = 0;
  let sinMatch = 0;
  let errores = 0;

  for await (const linea of stream) {
    if (linea.result.type !== "succeeded") {
      errores++;
      console.log(`    fallo de API en ${linea.custom_id}: ${linea.result.type}`);
      continue;
    }
    const texto = linea.result.message.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    const candidatos = candidatosPorId.get(linea.custom_id) || [];
    const codigosValidos = new Set(candidatos.map((c) => c.ciuo));
    const ciuo = parsearRespuesta(texto, codigosValidos);

    if (!ciuo) {
      sinMatch++;
      continue;
    }
    const candidato = candidatos.find((c) => c.ciuo === ciuo)!;
    await prisma.tituloCanonico.update({
      where: { id: linea.custom_id },
      data: { ciuo, rolCanonico: candidato.nombreGrupo },
    });
    clasificados++;
  }

  console.log(`  -> ${clasificados} clasificados, ${sinMatch} sin match ("ninguno"), ${errores} error(es) de API`);
}

async function main() {
  const pendientes = await prisma.tituloCanonico.findMany({
    where: { origen: "COSECHADO", ciuo: null },
    select: { id: true, formaLimpia: true },
  });

  if (!pendientes.length) {
    console.log("No hay títulos cosechados sin clasificar. Nada que hacer.");
    return;
  }

  console.log(`${pendientes.length} título(s) sin clasificar. Procesando en lotes de ${TAMANO_LOTE}...`);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  for (let i = 0; i < pendientes.length; i += TAMANO_LOTE) {
    await clasificarLote(anthropic, pendientes.slice(i, i + TAMANO_LOTE));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
