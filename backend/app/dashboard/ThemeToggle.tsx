"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [tema, setTema] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const guardado = (localStorage.getItem("ap-theme") as "dark" | "light") || "dark";
    setTema(guardado);
    aplicar(guardado);
  }, []);

  function aplicar(valor: "dark" | "light") {
    const shell = document.querySelector(".ap-shell");
    if (shell) shell.setAttribute("data-theme", valor);
  }

  function alternar() {
    const nuevo = tema === "dark" ? "light" : "dark";
    setTema(nuevo);
    localStorage.setItem("ap-theme", nuevo);
    aplicar(nuevo);
  }

  return (
    <button className="ap-theme-toggle" onClick={alternar}>
      {tema === "dark" ? "☀️  Modo claro" : "🌙  Modo oscuro"}
    </button>
  );
}
