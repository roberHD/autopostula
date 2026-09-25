// Verificación de la regla de precedencia (docs/estado-real-de-postulaciones.md
// §6.5 y §9), del chequeo de CV (docs/estrategia-y-rediseno.md §4.2) y de las
// razones en palabras (§5.4). Lógica pura, sin base de datos ni navegador:
//   npx tsx scripts/verificar-estado-real.ts
import { portalPuedeCambiar, RESPUESTAS_PERSONA } from "../lib/estado-real";
import { chequearCv } from "../lib/chequeo-cv";
import { formatearRazon, esRazonPositiva } from "../lib/formatear-razon";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

// ── §9: criterios de aceptación de la regla de precedencia ──
check("§9.2 el portal no pisa a la persona (ENTREVISTA contada, portal dice ENVIADO)", !portalPuedeCambiar("ENTREVISTA", "USUARIO", "ENVIADO"));
check("§9.2 ni aunque el portal diga algo 'mayor'", !portalPuedeCambiar("ENTREVISTA", "USUARIO", "FINALISTA"));
check("§9.3 el portal no baja de rango (EN_PROCESO → VISTO)", !portalPuedeCambiar("EN_PROCESO", "PORTAL", "VISTO"));
check("el portal sí sube de rango (ENVIADO → VISTO)", portalPuedeCambiar("ENVIADO", "PORTAL", "VISTO"));
check("el portal sí sube de rango (VISTO → FINALISTA)", portalPuedeCambiar("VISTO", "SISTEMA", "FINALISTA"));
check("RECHAZADO llega desde cualquier estado del portal", portalPuedeCambiar("FINALISTA", "PORTAL", "RECHAZADO"));
check("un estado cerrado no se reabre", !portalPuedeCambiar("RECHAZADO", "PORTAL", "EN_PROCESO"));
check("INCOMPLETA pasa a ENVIADO si el portal la muestra (§8.3)", portalPuedeCambiar("INCOMPLETA", "PORTAL", "ENVIADO"));
check("INCOMPLETA no salta a VISTO", !portalPuedeCambiar("INCOMPLETA", "PORTAL", "VISTO"));
check("mismo estado: no hay cambio", !portalPuedeCambiar("VISTO", "PORTAL", "VISTO"));
check("§9.4 la persona sí puede corregirse (ENTREVISTA → RECHAZADO)", RESPUESTAS_PERSONA.no_quede === "RECHAZADO");
check("'Nada todavía' no cambia el estado", RESPUESTAS_PERSONA.nada === null);
check("'Tuve entrevista' deja ENTREVISTA", RESPUESTAS_PERSONA.entrevista === "ENTREVISTA");

// ── Chequeo de CV ──
const cvFoto = chequearCv({ texto: "   \n  ", email: null, telefono: null, comuna: null, experiencia: null });
check("CV foto: no legible y una sola cosa por arreglar", !cvFoto.legible && cvFoto.porArreglar === 1, cvFoto);

const texto = [
  "Camila Soto · camila@correo.cl · +56 9 1234 5678 · Maipú",
  "Experiencia",
  "Bodeguero — Distribuidora Los Andes (2021 — 2024)",
  "- Preparación de pedidos",
  "- Recepción de mercadería",
  "- Control de inventario",
  "Operario — Frigorífico Central",
  "Educación: Enseñanza media completa. Licencia de conducir clase D al día. Manejo de grúa horquilla y transpaleta eléctrica.",
  "Disponibilidad inmediata, turno mañana o tarde. Referencias a solicitud. ".repeat(3),
].join("\n");
const cv = chequearCv({
  texto,
  email: "camila@correo.cl",
  telefono: "+56 9 1234 5678",
  comuna: "Maipú",
  experiencia: [
    { cargo: "Bodeguero", empresa: "Distribuidora Los Andes", periodo: "2021 — 2024" },
    { cargo: "Operario", empresa: "Frigorífico Central", periodo: "" },
  ],
});
const porClave = Object.fromEntries(cv.revisiones.map((r) => [r.clave, r.estado]));
check("CV legible", cv.legible && porClave.legible === "ok", porClave);
check("contacto completo", porClave.contacto === "ok", porClave);
check("una experiencia sin fechas → aviso", porClave.fechas === "aviso", porClave);
check("tareas sin cifras (los años no cuentan) → aviso", porClave.cifras === "aviso", porClave);
check("dos cosas por arreglar", cv.porArreglar === 2, cv.porArreglar);

// ── Razones en palabras (§5.4): nada de puntajes ni de "roles" ──
const ubic = { tipo: "ubicacion", ofertaEn: "Lampa", buscadas: ["Maipú"] };
check("ubicación en palabras", formatearRazon(ubic) === "Queda en Lampa, fuera de tus comunas", formatearRazon(ubic));
check("señal sin puntaje", !/[+-]\d/.test(formatearRazon({ tipo: "senal", patron: "turno mañana", delta: 2 })));
check("rol en palabras", formatearRazon({ tipo: "rol", rol: "bodega", termino: "bodeguero" }).startsWith("Es de bodega, lo que buscas"));
check("la ubicación va en contra", esRazonPositiva(ubic) === false);

console.log(fallos ? `\n${fallos} verificaciones fallaron` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
