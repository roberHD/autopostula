// La pretensión de renta en los formularios (lib/renta-ia.ts,
// docs/extension-laborum-2026-10-01.md §9). Con las preguntas reales del
// 2026-10-01: el modelo respondió "$1.800.000" sin ningún dato y la cifra se
// repitió en las postulaciones siguientes.
// Sin base de datos: npx tsx scripts/verificar-renta-ia.ts
import { preguntaPideRenta, rentaDeclarada, sinRentaInventada, sirveComoEjemplo } from "../lib/renta-ia";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (cond) console.log("✓ " + desc);
  else {
    fallos++;
    console.error("✗ " + desc, detalle === undefined ? "" : detalle);
  }
}

// ── Qué preguntas piden la renta ─────────────────────────────────
for (const p of [
  "Indícanos tus pretensiones de renta líquida.",
  "Indique expectativa de renta",
  "Indica tu expectativa de renta",
  "Indica tus pretensiones de renta líquida.",
  "¿Cuál es tu pretensión salarial?",
  "Renta esperada",
  "¿Cuánto esperas ganar?",
  "Expectativas económicas",
]) {
  check(`pide la renta: "${p}"`, preguntaPideRenta(p));
}
for (const p of [
  "¿Estás de acuerdo con la renta ofrecida?",
  "¿Tienes licencia de conducir clase B?",
  "Comenta tu experiencia en el cargo",
  "Disponibilidad para trabajar turnos 5x2 rotativos.",
  "Indícanos tu correo, número de contacto actualizado y comuna en que resides.",
]) {
  check(`no pide la renta: "${p}"`, !preguntaPideRenta(p));
}

// ── Si la persona la declaró ─────────────────────────────────────
check("sin renta en el perfil ni en los datos: no declarada", !rentaDeclarada("", []));
check("con renta en el perfil: declarada", rentaDeclarada("$600.000 líquidos", []));
check("con un dato guardado desde el panel: declarada", rentaDeclarada(null, ["pretensión de renta: $550.000 líquidos"]));
check("otros datos (licencia) no cuentan como renta", !rentaDeclarada("  ", ["licencia clase B: Si"]));

// ── Las respuestas del modelo ────────────────────────────────────
// El formulario de "Vendedor/a 30 hrs RayBan Mall Parque Arauco" (Laborum).
const preguntas = [
  { id: "t0", pregunta: "Disponibilidad para trabajar turnos 5x2 rotativos." },
  { id: "t1", pregunta: "Indícanos tu correo, número de contacto actualizado y comuna en que resides." },
  { id: "t2", pregunta: "¿Posees experiencia como vendedor en retail, específicamente dónde y por cuánto tiempo?" },
  { id: "t3", pregunta: "Indícanos tus pretensiones de renta líquida." },
];
const delModelo = [
  { id: "t0", respuesta: "Sí, tengo disponibilidad para turnos rotativos.", datoFaltante: null },
  { id: "t1", respuesta: "correo y teléfono del perfil", datoFaltante: null },
  { id: "t2", respuesta: "Sí, más de 3 años en retail.", datoFaltante: null },
  { id: "t3", respuesta: "$1.800.000", datoFaltante: null },
];
const sinDato = sinRentaInventada(delModelo, preguntas, "", []);
check("la renta inventada queda como dato faltante", sinDato[3].respuesta === null && sinDato[3].datoFaltante === "pretensión de renta", sinDato[3]);
check("...y las demás respuestas no se tocan", sinDato.slice(0, 3).every((r, i) => r === delModelo[i]));
const conDato = sinRentaInventada(delModelo, preguntas, "$600.000", []);
check("con la renta declarada, la respuesta del modelo se respeta", conDato[3].respuesta === "$1.800.000");
const yaFaltante = [{ id: "t3", respuesta: null, datoFaltante: "pretension de renta" }];
check("si el modelo ya la dejó como faltante, queda igual", sinRentaInventada(yaFaltante, preguntas, "", [])[0] === yaFaltante[0]);

// ── Qué respuestas anteriores vuelven al prompt ──────────────────
check("la renta que respondió la IA no vuelve como ejemplo", !sirveComoEjemplo({ pregunta: "Indique expectativa de renta", fueEditada: false }));
check("la que escribió o corrigió la persona sí", sirveComoEjemplo({ pregunta: "Indique expectativa de renta", fueEditada: true }));
check("una licencia respondida por la IA tampoco", !sirveComoEjemplo({ pregunta: "¿Tiene licencia de conducir?", fueEditada: false }));
check("una pregunta de experiencia sí vuelve (sirve para el estilo)", sirveComoEjemplo({ pregunta: "Comenta tu experiencia en el cargo", fueEditada: false }));

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK (0 fallos).");
process.exit(fallos ? 1 : 0);
