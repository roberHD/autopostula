// Ficha real en Chrome Web Store, publicada 2026-09. Chrome no deja que una
// página instale una extensión sola (la instalación "inline" está retirada
// hace años) -- lo único que se puede ofrecer es un enlace a la ficha; ahí
// la persona hace clic en "Agregar a Chrome" ella misma.
export const URL_CHROME_WEB_STORE =
  "https://chromewebstore.google.com/detail/autopostula/ecdhfiaepilljcpcidahkoppdomobhgb";

// docs/revision-2026-09-28.md §4: el correo de contacto que se muestra en la
// página. Antes el login y la página 404 decían hola@autopostula.cl, pero el
// dominio no tiene registro MX (no recibe correo): esos mensajes rebotaban. Es
// la misma dirección que ya publican los Términos y la Política de privacidad.
// Si algún día autopostula.cl recibe correo, se cambia acá y en esas dos páginas.
export const CORREO_CONTACTO = "AutopostulaI@gmail.com";

// docs/revision-2026-09-28.md §8: el código de quien te invitó, guardado en una
// cookie mientras vas y vuelves de Google. Registrarse con Google no pasa por
// /api/register (donde viaja el ?ref=), así que sin esto la invitación se perdía.
export const COOKIE_INVITACION = "ap_ref";

// docs/revision-2026-09-28.md §9: "Empezar con Premium" de la landing trae
// ?plan=premium, pero nadie lo leía y la persona terminaba igual que en el plan
// gratis. El registro lo recuerda en el navegador (localStorage, con esta
// llave) y el último paso del onboarding ofrece el pago.
export const LLAVE_INTENCION_PREMIUM = "ap_intencion_premium";
