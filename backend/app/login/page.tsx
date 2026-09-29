"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { MarcaAcceso, Mensaje, BotonGoogle, PanelTinta } from "@/components/acceso/Piezas";
import { CORREO_CONTACTO } from "@/lib/enlaces";

// useSearchParams() obliga a Next a renderizar esto dentro de un <Suspense> en
// el build de producción (si no, "next build" falla al pre-renderizar /login)
// — se aísla acá para no forzar eso sobre toda la página.
function ErrorDesdeQuery({ onError, onInfo }: { onError: (msg: string) => void; onInfo: (msg: string) => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      console.error("Error de Auth.js:", errorParam);
      // docs/revision-2026-09-28.md §17: el bloqueo por intentos también puede
      // llegar por la URL (sin JavaScript, el formulario vuelve con ?code=).
      onError(
        searchParams.get("code") === "demasiados_intentos"
          ? "Hubo demasiados intentos seguidos. Espera unos 15 minutos y vuelve a probar, o recupera tu contraseña."
          : "No pudimos iniciar tu sesión. Revisa tu correo y contraseña, o entra con Google."
      );
    }
    if (searchParams.get("eliminada") === "1") {
      onInfo("Tu cuenta se eliminó. Puedes crear una nueva cuando quieras.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

// A dónde volver después de entrar: solo rutas internas del panel (y el
// onboarding, que también pide sesión: docs/revision-2026-09-28.md §7). Un
// callbackUrl que apunte a otro sitio (o a cualquier otra ruta) se ignora, para
// que el login no sirva de redirección abierta.
function destinoDespuesDeEntrar(): string {
  try {
    const pedido = new URLSearchParams(window.location.search).get("callbackUrl");
    if (pedido && /^\/(dashboard|onboarding)(\/[\w\-/]*)?(\?[\w\-=&%.]*)?$/.test(pedido)) return pedido;
  } catch {
    // sin window (no debería pasar en un handler de cliente)
  }
  return "/dashboard";
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

    // docs/revision-2026-09-28.md: sin redirectTo, next-auth usa la URL actual
    // y después busca "error" en ella. Si la página venía con ?error= (por
    // ejemplo, tras un intento fallido con Google), un login correcto se leía
    // como fallido: la sesión quedaba abierta pero la pantalla decía que la
    // contraseña no coincidía.
    const res = await signIn("credentials", { email, password, redirect: false, redirectTo: destinoDespuesDeEntrar() });
    setEnviando(false);

    if (res?.error) {
      // docs/revision-2026-09-28.md §17: demasiados intentos fallidos seguidos.
      if (res.code === "demasiados_intentos") {
        setError("Hubo demasiados intentos seguidos. Espera unos 15 minutos y vuelve a probar, o recupera tu contraseña.");
        return;
      }
      // El código de Auth.js no le sirve a nadie que esté entrando: se
      // registra en consola y en pantalla va lo que se puede hacer.
      console.error("Falló el login:", res.error);
      setError("Ese correo y contraseña no coinciden. Revísalos, o entra con Google.");
      return;
    }

    router.push(destinoDespuesDeEntrar());
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
            onClick={() => signIn("google", { callbackUrl: destinoDespuesDeEntrar() })}
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
        // docs/revision-2026-09-28.md §12: "siguió postulando" no es cierto en
        // el plan gratis (ahí postula mientras estás en el portal). Lo que sí
        // es cierto para todos: lo que envía queda anotado acá.
        frase="Mientras no estabas,"
        marcado="todo quedó anotado."
        bajada="Cada postulación que envía la extensión queda acá, aunque cierres esta pestaña. Entra y mira en qué quedó cada una."
        hechos={[
          "Cada postulación registrada con su portal y su fecha",
          "Respuestas escritas con tus palabras, no con plantillas",
          "Computrabajo, Laborum y Trabajando.com en el mismo lugar",
        ]}
        nota={`¿Problemas para entrar? Escríbenos a ${CORREO_CONTACTO}`}
      />
    </div>
  );
}
