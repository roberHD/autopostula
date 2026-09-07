"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { MarcaAcceso, Mensaje, BotonGoogle, PanelTinta } from "@/components/acceso/Piezas";

export default function RegistroPage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "No pudimos crear tu cuenta. Intenta de nuevo en unos segundos.");
        setEnviando(false);
        return;
      }

      // Cuenta creada: se entra sola, sin pedir la contraseña otra vez.
      await signIn("credentials", { email, password, redirect: false });
      router.push("/dashboard");
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className="ap-acceso">
      <div className="ap-acceso__forma">
        <div className="ap-acceso__caja">
          <MarcaAcceso />

          <h1>Crea tu cuenta</h1>
          <p className="ap-acceso__sub">
            Gratis, sin tarjeta. Subes tu CV una vez y postulas a tu primera oferta hoy mismo.
          </p>

          <BotonGoogle
            texto="Crear cuenta con Google"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          />

          <div className="ap-separador"><span>o con tu correo</span></div>

          {error && <Mensaje tipo="error">{error}</Mensaje>}

          <form onSubmit={handleSubmit}>
            <div className="ap-campo">
              <label className="ap-campo__lab" htmlFor="nombre">Nombre</label>
              <input
                id="nombre"
                type="text"
                value={nombre}
                onChange={(ev) => setNombre(ev.target.value)}
                placeholder="Como aparece en tu CV"
                autoComplete="name"
                required
              />
            </div>

            <div className="ap-campo">
              <label className="ap-campo__lab" htmlFor="correo">Correo electrónico</label>
              <input
                id="correo"
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="ap-campo">
              <label className="ap-campo__lab" htmlFor="clave">Contraseña</label>
              <div style={{ position: "relative" }}>
                <input
                  id="clave"
                  type={mostrarPassword ? "text" : "password"}
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  minLength={8}
                  style={{ paddingRight: 42 }}
                  required
                />
                <button
                  type="button"
                  className="ap-campo__ojo"
                  onClick={() => setMostrarPassword((v) => !v)}
                  aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {mostrarPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="ap-btn ap-btn--primary"
              style={{ width: "100%", marginTop: 8 }}
              disabled={enviando}
            >
              {enviando ? "Creando tu cuenta…" : "Crear cuenta"}
            </button>
          </form>

          <p className="ap-acceso__pie">
            ¿Ya tienes cuenta? <Link href="/login">Entra acá</Link>
          </p>

          <p style={{ fontSize: 11.5, color: "var(--text-muted)", textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
            Al crear tu cuenta aceptas los{" "}
            <Link href="/terminos" style={{ color: "var(--text-muted)" }}>términos</Link> y la{" "}
            <Link href="/privacidad" style={{ color: "var(--text-muted)" }}>política de privacidad</Link>.
          </p>
        </div>
      </div>

      <PanelTinta
        frase="El último formulario"
        marcado="que llenas a mano."
        bajada="Después de este, los llena AutoPostula por ti — con tus palabras y tu experiencia real."
        hechos={[
          "20 postulaciones gratis al mes, sin tarjeta",
          "La IA lee tu CV y arma tu perfil sola",
          "Tú revisas antes de enviar, siempre",
        ]}
        nota="Cancelas o eliminas tu cuenta cuando quieras."
      />
    </div>
  );
}
