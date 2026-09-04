import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { obtenerCandidatos, construirPrompt, parsearRespuesta, normalizar } from "../lib/clasificador-titulos";

// Criterio de aceptación obligatorio del §12 antes de usar el clasificador en
// producción: correrlo contra las 82 referencias cruzadas CIUO_REFERENCIA del
// catálogo (§7.1) -- son desambiguaciones curadas a mano por el INE, casos de
// frontera a propósito (ej. "Gerente de tienda" -> 1420, no el 5221 obvio).
// Objetivo: >= 85% de aciertos. Más los 4 casos clave del §7.4 (nombres
// comerciales que no existen en ningún catálogo oficial).
//
// Uso: npx tsx scripts/validar-clasificador.ts

const MODEL = "claude-opus-5";

type CasoPrueba = { titulo: string; esperado: string; grupo: "referencia" | "clave" };

function cargarCasosReferencia(): CasoPrueba[] {
  const ruta = path.join(__dirname, "data", "catalogo-ocupaciones-cl.json");
  const catalogo = JSON.parse(fs.readFileSync(ruta, "utf8"));
  return catalogo.ocupaciones
    .filter((o: any) => o.fuente === "CIUO_REFERENCIA")
    .map((o: any) => ({ titulo: o.ocupacion, esperado: o.ciuo, grupo: "referencia" as const }));
}

// "Si estos cuatro fallan, el clasificador no está resolviendo el problema
// para el que existe" (§7.4) -- ninguno de estos términos existe en CIUO ni
// ChileValora, son nombres de mercado.
const CASOS_CLAVE: CasoPrueba[] = [
  { titulo: "asesor comercial", esperado: "5223", grupo: "clave" },
  { titulo: "teleoperador", esperado: "4222", grupo: "clave" },
  { titulo: "barista", esperado: "5132", grupo: "clave" },
  { titulo: "atencion al cliente", esperado: "4229", grupo: "clave" },
];

async function main() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const referencia = cargarCasosReferencia();
  const casos = [...referencia, ...CASOS_CLAVE];
  console.log(
    `Validando ${referencia.length} referencias CIUO_REFERENCIA + ${CASOS_CLAVE.length} casos clave del ` +
      `§7.4 = ${casos.length} llamadas, modelo ${MODEL} vía Batch API.`
  );

  const preparados = casos.map((caso, i) => {
    const candidatos = obtenerCandidatos(normalizar(caso.titulo));
    const { system, user } = construirPrompt(caso.titulo, candidatos);
    return {
      custom_id: `caso-${i}`,
      params: {
        // 20 tokens no alcanzaba: Opus a veces razona un poco antes de
        // responder en casos difíciles y la respuesta quedaba cortada antes
        // de llegar al código (medido: "asesor comercial" necesitó 103
        // tokens de salida). parsearRespuesta ya toma el último código de
        // la respuesta, así que el margen extra no rompe el parseo de los
        // casos que sí contestan corto.
        model: MODEL,
        max_tokens: 300,
        system,
        messages: [{ role: "user" as const, content: user }],
      },
      caso,
      candidatos,
    };
  });

  const sinCandidatos = preparados.filter((p) => !p.candidatos.length).length;
  if (sinCandidatos) console.log(`Aviso: ${sinCandidatos} caso(s) sin ningún candidato del prefiltro.`);

  console.log("Enviando batch...");
  const batch = await anthropic.messages.batches.create({
    requests: preparados.map(({ custom_id, params }) => ({ custom_id, params })),
  });
  console.log("Batch creado:", batch.id);

  let estado = batch;
  while (estado.processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, 5000));
    estado = await anthropic.messages.batches.retrieve(batch.id);
    console.log("  estado:", estado.processing_status, JSON.stringify(estado.request_counts));
  }

  const respuestasCrudas = new Map<string, string>();
  const stream = await anthropic.messages.batches.results(batch.id);
  for await (const linea of stream) {
    if (linea.result.type === "succeeded") {
      const texto = linea.result.message.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      respuestasCrudas.set(linea.custom_id, texto);
    } else {
      console.log("  fallo de API en", linea.custom_id, "->", linea.result.type);
    }
  }

  type Fila = { titulo: string; esperado: string; obtenido: string | null; raw: string; acierto: boolean };
  const filas: Fila[] = preparados.map((p) => {
    const raw = respuestasCrudas.get(p.custom_id) || "";
    const codigosValidos = new Set(p.candidatos.map((c) => c.ciuo));
    const obtenido = parsearRespuesta(raw, codigosValidos);
    return { titulo: p.caso.titulo, esperado: p.caso.esperado, obtenido, raw, acierto: obtenido === p.caso.esperado };
  });

  const filasReferencia = filas.slice(0, referencia.length);
  const filasClave = filas.slice(referencia.length);

  const aciertosRef = filasReferencia.filter((f) => f.acierto).length;
  const pctRef = referencia.length ? (aciertosRef / referencia.length) * 100 : 0;

  console.log("\n=== Referencias CIUO_REFERENCIA (curadas por el INE) ===");
  console.log(`${aciertosRef}/${referencia.length} aciertos (${pctRef.toFixed(1)}%) -- objetivo §12: >= 85%`);
  console.log(pctRef >= 85 ? "✅ CUMPLE el criterio de aceptación." : "❌ NO cumple el criterio de aceptación.");

  console.log("\n=== Los 4 casos clave del §7.4 ===");
  filasClave.forEach((f) => {
    console.log(`  ${f.acierto ? "✅" : "❌"} "${f.titulo}" -> esperado ${f.esperado}, obtuvo ${f.obtenido ?? "ninguno"}`);
  });

  const fallosRef = filasReferencia.filter((f) => !f.acierto);
  if (fallosRef.length) {
    console.log(`\nFallos en referencias (${fallosRef.length}):`);
    fallosRef.forEach((f) => console.log(`  "${f.titulo}" -> esperado ${f.esperado}, obtuvo ${f.obtenido ?? "ninguno"} (raw: "${f.raw}")`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
