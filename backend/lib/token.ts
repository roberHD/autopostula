import { createHash, randomBytes } from "crypto";

/**
 * Los tokens secretos de una cuenta se guardan solo como hash
 * (Ley 19.628 modificada por la 21.719, art. 14 quinquies: medidas de
 * seguridad adecuadas al riesgo, "la seudonimización y el cifrado").
 *
 * Antes la base guardaba tal cual el token de la extensión (que postula en
 * nombre de la cuenta) y los de los enlaces de recuperar contraseña y de
 * verificar el correo: quien leyera la base podía usarlos directamente. Ahora
 * la base guarda el SHA-256 y el token de verdad existe solo donde se entrega:
 * en la extensión, o en el enlace del correo.
 *
 * SHA-256 sin sal alcanza porque los tokens son 32 bytes al azar: no hay un
 * diccionario de dónde adivinarlos, que es lo único que la sal evita. Y como el
 * hash es determinista, se puede buscar por él en un índice único, igual que
 * antes se buscaba el token.
 *
 * La migración 20261011120000_tokens_con_hash pasó los tokens que ya existían
 * a su hash, así que las extensiones conectadas y los enlaces vigentes siguen
 * funcionando sin hacer nada.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Un token nuevo: `token` se entrega una sola vez, `hash` es lo que se guarda. */
export function nuevoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}
