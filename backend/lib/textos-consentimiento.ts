// Los textos y versiones de lo que se pide aceptar (lib/consentimiento.ts).
// Aparte de ese módulo porque este se importa también en el navegador, y aquel
// toca la base de datos.

// La fecha de los términos y la política vigentes (las dos páginas dicen
// "actualizado el 19 de septiembre de 2026"). Al cambiar cualquiera de las dos
// de forma relevante, se cambia esto: todas las cuentas vuelven a aceptar la
// próxima vez que entren al panel.
export const VERSION_DOCUMENTOS = "2026-09-19";

// El texto de la autorización del CV (abajo). Si el texto cambia, cambia esto.
export const VERSION_DATOS_SENSIBLES = "2026-10-06";

export const TEXTO_DATOS_SENSIBLES =
  "Autorizo a AutoPostula a tratar los datos sensibles que pueda contener mi CV (por ejemplo, de salud, " +
  "discapacidad, origen étnico o situación socioeconómica) solo para completar mis postulaciones, lo que " +
  "incluye enviarlos a Anthropic, en Estados Unidos, para redactar las respuestas. Puedo retirar esta " +
  "autorización cuando quiera; al hacerlo se borra mi CV.";
