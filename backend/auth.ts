import NextAuth, { CredentialsSignin } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { normalizarEmail, LARGO_MAXIMO_PASSWORD } from "@/lib/entrada";
import { anotarIntento, claveLimite, ipDe, LIMITES, superaLimite } from "@/lib/limite-tasa";
import { premiarInvitacion } from "@/lib/extras";
import { COOKIE_INVITACION } from "@/lib/enlaces";

// docs/revision-2026-09-28.md §17: el login no tenía límite de intentos. Con
// este código la pantalla de login puede decir "espera unos minutos" en vez de
// "contraseña incorrecta" (signIn() lo devuelve en `code`).
class DemasiadosIntentos extends CredentialsSignin {
  code = "demasiados_intentos";
}

// docs/revision-2026-09-28.md §18: el correo se guardaba tal cual venía, así
// que hay cuentas viejas con mayúsculas. Se buscan sin distinguirlas; si hay
// más de una (la misma dirección escrita distinto), primero la más antigua.
function cuentasConEmail(email: string) {
  return prisma.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { creadoEn: "asc" },
  });
}

async function codigoDeInvitacion(): Promise<string | null> {
  try {
    const valor = (await cookies()).get(COOKIE_INVITACION)?.value;
    return valor ? valor.trim().toUpperCase().slice(0, 20) : null;
  } catch {
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, request) {
        const email = normalizarEmail(credentials?.email);
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password || password.length > LARGO_MAXIMO_PASSWORD) return null;

        const claveIp = claveLimite("login-ip", ipDe(request));
        const claveEmail = claveLimite("login-email", email);
        if ((await superaLimite(claveIp, LIMITES.loginPorIp)) || (await superaLimite(claveEmail, LIMITES.loginPorEmail))) {
          throw new DemasiadosIntentos();
        }

        try {
          // Usuario que se registró con Google no tiene passwordHash.
          for (const user of await cuentasConEmail(email)) {
            if (user.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
              return { id: user.id, email: user.email, name: user.nombre };
            }
          }
        } catch (e) {
          // Auth.js convierte cualquier excepción de acá en un CredentialsSignin
          // genérico, indistinguible de una contraseña mala: sin este log, una
          // base desincronizada (P2022) o caída se ve en pantalla como "clave
          // incorrecta" y no deja rastro en la terminal.
          console.error("[auth] authorize() falló por un error inesperado:", e);
          return null;
        }

        // Solo los intentos fallidos cuentan para el límite.
        await Promise.all([anotarIntento(claveIp), anotarIntento(claveEmail)]).catch((e) =>
          console.error("[auth] No se pudo anotar el intento fallido:", e),
        );
        return null;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const email = normalizarEmail(user.email);
      if (!email) return false;
      // docs/verificacion-de-correo.md: Google ya confirma sus correos -- no le
      // pedimos a la persona que verifique de nuevo algo que el proveedor ya
      // verificó. Salvedad: si Google mismo manda email_verified=false (cuenta
      // corporativa sin confirmar, por ejemplo), no se lo damos por verificado.
      const googleLoVerifico = (profile as { email_verified?: boolean } | undefined)?.email_verified !== false;
      const existente = (await cuentasConEmail(email))[0] ?? null;

      // Con Google: si el correo no existe en la base, se crea el usuario ahí mismo.
      if (!existente) {
        // §8: quien llegó por un enlace de invitación y eligió Google.
        const codigo = await codigoDeInvitacion();
        const invitadoPor = codigo
          ? await prisma.user.findUnique({ where: { codigoInvitacion: codigo }, select: { id: true } })
          : null;
        const nuevo = await prisma.user.create({
          data: {
            email,
            nombre: user.name,
            oauthProvider: "google",
            emailVerificado: googleLoVerifico ? new Date() : null,
            invitadoPorId: invitadoPor?.id ?? null,
          },
        });
        // Con correo ya verificado por Google, el premio de quien invitó se paga
        // ahora: esta cuenta nunca pasa por /api/auth/verificar-email.
        if (nuevo.emailVerificado && nuevo.invitadoPorId) {
          await premiarInvitacion(nuevo.id).catch((e) => console.error("[extras] premio de invitación (Google):", e));
        }
        return true;
      }

      // docs/revision-2026-09-28.md §2: una cuenta creada con contraseña y SIN
      // verificar pudo crearla cualquiera que supiera el correo. Si la dueña
      // del correo entra después con Google, antes quedaba dentro de esa cuenta
      // y quien la creó seguía teniendo la contraseña (y veía su CV). Ahora
      // Google prueba que el correo es de quien entra: la cuenta pasa a ser
      // suya, la contraseña y el token de la extensión se borran, y cualquier
      // sesión abierta con ellos deja de valer.
      if (!existente.emailVerificado) {
        if (!googleLoVerifico) return false;
        await prisma.user.update({
          where: { id: existente.id },
          data: {
            emailVerificado: new Date(),
            oauthProvider: "google",
            passwordHash: null,
            apiToken: null,
            resetToken: null,
            resetTokenExpiry: null,
            verifyToken: null,
            verifyTokenExpiry: null,
            sesionesValidasDesde: new Date(),
          },
        });
        await premiarInvitacion(existente.id).catch((e) => console.error("[extras] premio de invitación (Google):", e));
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Al entrar: con credenciales, authorize() ya devolvió el id de la cuenta;
      // con Google, user.id es el de Google y la cuenta se busca por correo.
      if (user) {
        const dbUser =
          account?.provider === "credentials" && user.id
            ? await prisma.user.findUnique({ where: { id: user.id } })
            : user.email
              ? (await cuentasConEmail(normalizarEmail(user.email) ?? user.email))[0] ?? null
              : null;
        if (dbUser) {
          token.userId = dbUser.id;
          token.rol = dbUser.rol;
          token.emitidoEn = Date.now();
        }
        return token;
      }

      // docs/revision-2026-09-28.md §22: en cada uso de la sesión se revisa que
      // siga valiendo. Restablecer la contraseña (o que Google recupere una
      // cuenta) cierra las sesiones abiertas antes, en todos los navegadores.
      // De paso, el rol se lee fresco: un cambio de rol ya no espera al próximo login.
      if (typeof token.userId === "string") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { rol: true, sesionesValidasDesde: true },
        });
        // Una cuenta borrada la sigue manejando getUsuarioSesion, con su mensaje.
        if (!dbUser) return token;
        const emitido =
          typeof token.emitidoEn === "number" ? token.emitidoEn : typeof token.iat === "number" ? token.iat * 1000 : 0;
        if (dbUser.sesionesValidasDesde && emitido < dbUser.sesionesValidasDesde.getTime()) return null;
        token.rol = dbUser.rol;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId;
        (session.user as any).rol = token.rol;
      }
      return session;
    },
  },
});
