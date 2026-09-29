import { auth } from "@/auth";
import { NextResponse } from "next/server";

// docs/revision-2026-09-28.md §7: /onboarding también. Antes se abría sin
// sesión, mostraba "¡Bienvenido!" y dejaba avanzar mientras todo fallaba con 401.
const rutasProtegidas = ["/dashboard", "/onboarding"];

export default auth((req) => {
  const esProtegida = rutasProtegidas.some((ruta) =>
    (req as any).nextUrl.pathname.startsWith(ruta)
  );

  if (esProtegida && !req.auth) {
    const loginUrl = new URL("/login", (req as any).nextUrl.origin);
    // docs/pase-prepagado.md §6: los correos de vencimiento llevan directo al
    // checkout del pase; sin sesión se pasa por el login y se vuelve ahí.
    const { pathname, search } = (req as any).nextUrl;
    loginUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*"],
};
