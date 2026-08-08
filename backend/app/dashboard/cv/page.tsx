"use client";

import { useState } from "react";

export default function CvUploadPage() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<"idle" | "subiendo" | "listo" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return;

    setEstado("subiendo");
    setMensaje("");

    const formData = new FormData();
    formData.append("cv", archivo);

    try {
      const res = await fetch("/api/cv/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setEstado("error");
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }

      setEstado("listo");
      setMensaje(`CV cargado: ${data.nombreArchivo} (${data.largoTexto} caracteres extraídos)`);
    } catch (err) {
      console.error(err);
      setEstado("error");
      setMensaje("Ocurrió un error inesperado, revisa la consola");
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "80px auto" }}>
      <h1>Sube tu CV</h1>
      <p>Solo puedes tener un CV vigente — subir uno nuevo reemplaza el anterior.</p>

      <form onSubmit={handleSubmit}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          style={{ marginBottom: 12 }}
        />
        <br />
        <button
          type="submit"
          disabled={!archivo || estado === "subiendo"}
          style={{ padding: 10 }}
        >
          {estado === "subiendo" ? "Subiendo..." : "Subir CV"}
        </button>
      </form>

      {mensaje && (
        <p style={{ color: estado === "error" ? "red" : "green", marginTop: 16 }}>
          {mensaje}
        </p>
      )}

      <p style={{ marginTop: 24 }}>
        <a href="/dashboard">Volver al dashboard</a>
      </p>
    </div>
  );
}
