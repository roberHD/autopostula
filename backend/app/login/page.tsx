"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { MarcaAcceso, Mensaje, BotonGoogle, PanelTinta } from "@/components/acceso/Piezas";

// useSearchParams() obliga a Next a renderizar esto dentro de un <Suspense> en
// el build de producción (si no, "next build" falla al pre-renderizar /login)
// — se aísla acá para no forzar eso sobre toda la página.
function ErrorDesdeQuery({ onError, onInfo }: { onError: (msg: string) => void; onInfo: (msg: string) => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      console.error("Error de Auth.js:", errorParam);
      onError("No pudimos iniciar tu sesión. Revisa tu correo y contraseña, o entra con Google.");
    }
    if (searchParams.get("eliminada") === "1") {
      onInfo("Tu cuenta se eliminó. Puedes crear una nueva cuando quieras.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);

    const res = await signIn("credentials", { email, password, redirect: false });
    setEnviando(false);

    if (res?.error) {
      // El código de Auth.js no le sirve a nadie que esté entrando: se
      // registra en consola y en pantalla va lo que se puede hacer.
      console.error("Falló el login:", res.error);
      setError("Ese correo y contraseña no coinciden. Revísalos, o entra con Google.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="ap-acceso">
      <Suspense fallback={null}>
        <ErrorDesdeQuery onError={setError} onInfo={setInfoMsg} />
      </Suspense>

      <div className="ap-acceso__forma">
        <div className="ap-acceso__caja">
          <MarcaAcceso />

          <h1>Entra a tu cuenta</h1>
          <p className="ap-acceso__sub">
            Tu historial, tus filtros y tu forma de escribir te esperan tal como los dejaste.
          </p>

          <BotonGoogle
            texto="Entrar con Google"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          />

          <div className="ap-separador"><span>o con tu correo</span></div>

          {error && <Mensaje tipo="error">{error}</Mensaje>}
          {!error && infoMsg && <Mensaje tipo="info">{infoMsg}</Mensaje>}

          <form onSubmit={handleSubmit}>
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
              <label className="ap-campo__lab" htmlFor="clave">
                Contraseña
                <Link href="/login/forgot-password">¿La olvidaste?</Link>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="clave"
                  type={mostrarPassword ? "text" : "password"}
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  autoComplete="current-password"
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
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <p className="ap-acceso__pie">
            ¿Todavía no tienes cuenta? <Link href="/registro">Créala gratis</Link>
          </p>
        </div>
      </div>

      <PanelTinta
        frase="Mientras no estabas,"
        marcado="siguió postulando."
        bajada="AutoPostula no para cuando cierras la pestaña. Entra y mira en qué quedó cada postulación."
        hechos={[
          "Cada oferta con el estado real que devuelve el portal",
          "Respuestas escritas con tus palabras, no con plantillas",
          "Computrabajo y Laborum, en el mismo lugar",
        ]}
        nota="¿Problemas para entrar? Escríbenos a hola@autopostula.cl"
      />
    </div>
  );
}
