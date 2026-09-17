"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

// docs/revision-2026-09-16.md §2.1: la ubicación se declara con opciones
// cerradas (región + comuna, de /api/regiones-comunas), nunca texto libre --
// mismo componente en el onboarding (paso "¿Qué buscas?") y en
// /dashboard/filtros, para que editarla después sea literalmente lo mismo
// que declararla la primera vez.

export type UbicacionValor = {
  regiones: string[];
  comunas: string[];
  todaLaRegion: boolean;
  aceptaRemoto: boolean;
};

export function ubicacionVacia(): UbicacionValor {
  return { regiones: [], comunas: [], todaLaRegion: false, aceptaRemoto: false };
}

type Region = { codigo: string; nombre: string };
type Comuna = { nombre: string; region: string };

export default function UbicacionPicker({
  valor,
  onChange,
}: {
  valor: UbicacionValor;
  onChange: (v: UbicacionValor) => void;
}) {
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busquedaComuna, setBusquedaComuna] = useState("");

  useEffect(() => {
    fetch("/api/regiones-comunas")
      .then((r) => r.json())
      .then((data) => {
        setRegiones(data.regiones ?? []);
        setComunas(data.comunas ?? []);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  function alternarRegion(codigo: string) {
    const yaEsta = valor.regiones.includes(codigo);
    const nuevasRegiones = yaEsta ? valor.regiones.filter((r) => r !== codigo) : [...valor.regiones, codigo];
    // Al sacar una región, se sacan también las comunas elegidas que eran de ella.
    const nuevasComunas = yaEsta
      ? valor.comunas.filter((c) => {
          const com = comunas.find((cc) => cc.nombre.toLowerCase() === c.toLowerCase());
          return !com || com.region !== codigo;
        })
      : valor.comunas;
    onChange({ ...valor, regiones: nuevasRegiones, comunas: nuevasComunas });
  }

  function alternarComuna(nombre: string) {
    const nombreN = nombre.toLowerCase();
    const yaEsta = valor.comunas.some((c) => c.toLowerCase() === nombreN);
    onChange({
      ...valor,
      comunas: yaEsta ? valor.comunas.filter((c) => c.toLowerCase() !== nombreN) : [...valor.comunas, nombre],
    });
  }

  const comunasDeLasRegiones = comunas.filter((c) => valor.regiones.includes(c.region));
  const comunasFiltradas = busquedaComuna.trim()
    ? comunasDeLasRegiones.filter((c) => c.nombre.toLowerCase().includes(busquedaComuna.trim().toLowerCase()))
    : comunasDeLasRegiones;

  if (cargando) {
    return <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Cargando comunas...</p>;
  }

  return (
    <div>
      <label className="ap-label">Región (una o más)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {regiones.map((r) => {
          const activo = valor.regiones.includes(r.codigo);
          return (
            <button
              key={r.codigo}
              type="button"
              aria-pressed={activo}
              onClick={() => alternarRegion(r.codigo)}
              className="ap-etiqueta"
              style={{
                cursor: "pointer",
                background: activo ? "var(--accent)" : undefined,
                color: activo ? "var(--accent-contrast)" : undefined,
                borderColor: activo ? "var(--accent)" : undefined,
              }}
            >
              {r.nombre}
            </button>
          );
        })}
      </div>

      {valor.regiones.length > 0 && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={valor.todaLaRegion}
              onChange={(e) => onChange({ ...valor, todaLaRegion: e.target.checked })}
            />
            <span style={{ fontSize: 13 }}>
              {valor.regiones.length > 1 ? "Toda esa región/regiones" : "Toda la región"} (no elijo comunas específicas)
            </span>
          </label>

          {!valor.todaLaRegion && (
            <div style={{ marginBottom: 14 }}>
              <label className="ap-label">Comunas</label>
              {valor.comunas.length > 0 && (
                <div className="ap-etiquetas" style={{ marginBottom: 8 }}>
                  {valor.comunas.map((c) => (
                    <span key={c} className="ap-etiqueta">
                      {c}
                      <button
                        type="button"
                        className="ap-etiqueta__x"
                        onClick={() => alternarComuna(c)}
                        aria-label={`Quitar ${c}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                className="ap-input"
                placeholder="Buscar comuna…"
                value={busquedaComuna}
                onChange={(e) => setBusquedaComuna(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div
                style={{
                  maxHeight: 170,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: 4,
                }}
              >
                {comunasFiltradas.slice(0, 80).map((c) => {
                  const elegida = valor.comunas.some((v) => v.toLowerCase() === c.nombre.toLowerCase());
                  return (
                    <button
                      key={c.nombre}
                      type="button"
                      onClick={() => alternarComuna(c.nombre)}
                      className="ap-button-ghost"
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "7px 9px",
                        fontSize: 12.5,
                        border: "none",
                        background: elegida ? "var(--bg-elevated-2)" : undefined,
                        fontWeight: elegida ? 700 : undefined,
                      }}
                    >
                      {c.nombre}
                    </button>
                  );
                })}
                {comunasFiltradas.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", padding: 7 }}>Sin resultados</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={valor.aceptaRemoto}
          onChange={(e) => onChange({ ...valor, aceptaRemoto: e.target.checked })}
        />
        <span style={{ fontSize: 13 }}>También acepto trabajo remoto, de cualquier ubicación</span>
      </label>
    </div>
  );
}
