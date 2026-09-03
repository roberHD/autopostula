import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

          // Usuario que se registró con Google no tiene passwordHash
          if (!user || !user.passwordHash) return null;

          const esValida = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );

          if (!esValida) return null;

          return { id: user.id, email: user.email, name: user.nombre };
        } catch (e) {
          // Auth.js convierte cualquier excepción de acá en un CredentialsSignin
          // genérico, indistinguible de una contraseña mala: sin este log, una
          // base desincronizada (P2022) o caída se ve en pantalla como "clave
          // incorrecta" y no deja rastro en la terminal.
          console.error("[auth] authorize() falló por un error inesperado:", e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Con Google: si el correo no existe en la base, se crea el usuario ahí mismo
      if (account?.provider === "google" && user.email) {
        const existente = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!existente) {
          await prisma.user.create({
            data: {
              email: user.email,
              nombre: user.name,
              oauthProvider: "google",
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.rol = dbUser.rol;
        }
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
