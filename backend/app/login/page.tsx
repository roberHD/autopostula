"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Auth.js redirige aquí con ?error=... cuando falla Google (o cualquier proveedor con redirect normal)
    const errorParam = searchParams.get("error");
    if (errorParam) {
      console.error("Error de Auth.js:", errorParam);
      setError(`Error: ${errorParam} — revisa la terminal donde corre "npm run dev"`);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    console.log("Respuesta de signIn:", res);

    if (res?.error) {
      setError(`Falló el login (código: ${res.error}) — revisa la terminal del servidor`);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto" }}>
      <h1>Iniciar sesión</h1>

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        style={{ width: "100%", padding: 10, marginBottom: 16 }}
      >
        Continuar con Google
      </button>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" style={{ width: "100%", padding: 10 }}>
          Entrar
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        ¿No tienes cuenta? <a href="/registro">Regístrate</a>
      </p>
    </div>
  );
}
