import { auth } from "@/auth";
import { NextResponse } from "next/server";

const rutasProtegidas = ["/dashboard"];

export default auth((req) => {
  const esProtegida = rutasProtegidas.some((ruta) =>
    (req as any).nextUrl.pathname.startsWith(ruta)
  );

  if (esProtegida && !req.auth) {
    const loginUrl = new URL("/login", (req as any).nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
