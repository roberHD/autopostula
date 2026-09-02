// pdf-parse usa pdfjs-dist por dentro, que espera DOMMatrix/ImageData/Path2D
// del navegador -- normalmente los saca de @napi-rs/canvas, pero ese paquete
// es un binario nativo que el tracer de archivos de Vercel no siempre incluye
// en la función serverless (funciona local, revienta en producción con
// "ReferenceError: DOMMatrix is not defined" al cargar el módulo).
//
// Acá solo extraemos texto (nunca renderizamos páginas a imagen), así que no
// hace falta canvas real: un shim de DOMMatrix basta para que pdfjs-dist
// cargue sin explotar, e ImageData/Path2D solo necesitan existir (sus métodos
// no se usan fuera del renderizado a canvas).
//
// Importar este archivo ANTES que "pdf-parse" en cualquier módulo que lo use.
import DOMMatrixPolyfill from "dommatrix";

if (typeof (globalThis as any).DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}
if (typeof (globalThis as any).ImageData === "undefined") {
  (globalThis as any).ImageData = class ImageData {};
}
if (typeof (globalThis as any).Path2D === "undefined") {
  (globalThis as any).Path2D = class Path2D {};
}
