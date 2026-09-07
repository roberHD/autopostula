"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Landmark, ShieldCheck, CreditCard, Lock } from "lucide-react";
import { useAvisos } from "@/components/Avisos";

const PRECIO = "$3.990";

// Los bancos con convenio de cargo automático en Chile. El código es el que
// usan las nóminas bancarias, no un id interno nuestro.
const BANCOS = [
  { codigo: "012", nombre: "Banco Estado" },
  { codigo: "001", nombre: "Banco de Chile" },
  { codigo: "016", nombre: "Banco BCI" },
  { codigo: "037", nombre: "Banco Santander" },
  { codigo: "027", nombre: "Banco Itaú" },
  { codigo: "028", nombre: "Banco BICE" },
  { codigo: "055", nombre: "Banco Falabella" },
  { codigo: "051", nombre: "Banco Ripley" },
  { codigo: "053", nombre: "Banco Security" },
  { codigo: "039", nombre: "Banco Internacional" },
  { codigo: "049", nombre: "Banco Consorcio" },
  { codigo: "672", nombre: "Coopeuch" },
];

const TIPOS_CUENTA = [
  { id: "corriente", label: "Cuenta corriente" },
  { id: "vista", label: "Cuenta vista / RUT" },
  { id: "ahorro", label: "Cuenta de ahorro" },
];

/**
 * Valida un RUT chileno con el dígito verificador (módulo 11). Sirve para
 * atajar el typo antes de mandarlo al banco, donde el rechazo llega días
 * después y sin explicación.
 */
function rutValido(rut: string) {
  const limpio = rut.replace(/[.\-\s]/g, "").toUpperCase();
  if (limpio.length < 8) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;

  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

function formatearRut(valor: string) {
  const limpio = valor.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length <= 1) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

export default function PagoPremiumPage() {
  const router = useRouter();
  const { error: avisarError } = useAvisos();

  const [titular, setTitular] = useState("");
  const [rut, setRut] = useState("");
  const [banco, setBanco] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState("corriente");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [email, setEmail] = useState("");
  const [autoriza, setAutoriza] = useState(false);
  const [redirigiendo, setRedirigiendo] = useState(false);

  const errores = {
    titular: titular.trim().length > 0 && titular.trim().length < 5,
    rut: rut.length > 0 && !rutValido(rut),
    numeroCuenta: numeroCuenta.length > 0 && numeroCuenta.replace(/\D/g, "").length < 6,
    email: email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  };

  const completo =
    titular.trim().length >= 5 &&
    rutValido(rut) &&
    banco !== "" &&
    numeroCuenta.replace(/\D/g, "").length >= 6 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    autoriza;

  // El checkout con tarjeta sigue siendo el de Flow: es su página alojada, los
  // datos de la tarjeta no pasan por acá.
  async function pagarConTarjeta() {
    setRedirigiendo(true);
    try {
      const res = await fetch("/api/flow/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        avisarError("No pudimos continuar", data.error ?? "Intenta de nuevo en un momento.");
        setRedirigiendo(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      avisarError("No pudimos continuar", "Revisa tu conexión y vuelve a intentar.");
      setRedirigiendo(false);
    }
  }

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <button
          className="ap-button-ghost"
          onClick={() => router.push("/dashboard/premium")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12 }}
        >
          <ArrowLeft size={14} /> Volver a Premium
        </button>
        <h1 className="ap-page-title">Datos de pago</h1>
        <p className="ap-page-sub">
          Cargo automático mensual a tu cuenta bancaria. Puedes cancelarlo cuando quieras desde Ajustes.
        </p>
      </div>

      <div className="ap-fila-2">
        <div>
          <div className="ap-section ap-animate-in" style={{ animationDelay: "0s" }}>
            <p className="ap-section-title">Cuenta bancaria</p>
            <p className="ap-section-sub">
              Debe ser una cuenta a tu nombre — el banco rechaza el cargo si el RUT del titular no calza.
            </p>

            <div className="ap-field">
              <label className="ap-label" htmlFor="titular">Nombre del titular</label>
              <input
                id="titular"
                className="ap-input"
                value={titular}
                onChange={(e) => setTitular(e.target.value)}
                placeholder="Como aparece en tu cuenta"
                autoComplete="name"
              />
              {errores.titular && <p className="ap-error-campo">Escribe el nombre completo.</p>}
            </div>

            <div className="ap-fila-campos">
              <div className="ap-field">
                <label className="ap-label" htmlFor="rut">RUT del titular</label>
                <input
                  id="rut"
                  className="ap-input"
                  value={rut}
                  onChange={(e) => setRut(formatearRut(e.target.value))}
                  placeholder="12.345.678-5"
                  inputMode="text"
                />
                {errores.rut && <p className="ap-error-campo">Ese RUT no es válido.</p>}
              </div>

              <div className="ap-field">
                <label className="ap-label" htmlFor="banco">Banco</label>
                <select
                  id="banco"
                  className="ap-select"
                  value={banco}
                  onChange={(e) => setBanco(e.target.value)}
                >
                  <option value="">Elige tu banco</option>
                  {BANCOS.map((b) => (
                    <option key={b.codigo} value={b.codigo}>{b.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ap-field">
              <label className="ap-label">Tipo de cuenta</label>
              <div className="ap-option-group">
                {TIPOS_CUENTA.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTipoCuenta(t.id)}
                    className={"ap-option-card" + (tipoCuenta === t.id ? " ap-option-card-active" : "")}
                    aria-pressed={tipoCuenta === t.id}
                  >
                    <span className="ap-option-title">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ap-field">
              <label className="ap-label" htmlFor="cuenta">Número de cuenta</label>
              <input
                id="cuenta"
                className="ap-input"
                value={numeroCuenta}
                onChange={(e) => setNumeroCuenta(e.target.value.replace(/[^\d\s-]/g, ""))}
                placeholder="Solo números, sin puntos ni guiones"
                inputMode="numeric"
              />
              {errores.numeroCuenta && <p className="ap-error-campo">Revisa el número — parece incompleto.</p>}
            </div>

            <div className="ap-field" style={{ marginBottom: 0 }}>
              <label className="ap-label" htmlFor="email">Correo para el comprobante</label>
              <input
                id="email"
                className="ap-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
              />
              {errores.email && <p className="ap-error-campo">Ese correo no se ve bien.</p>}
            </div>
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.05s" }}>
            <label className="ap-autoriza">
              <input
                type="checkbox"
                checked={autoriza}
                onChange={(e) => setAutoriza(e.target.checked)}
              />
              <span>
                Autorizo a AutoPostula a cargar <b>{PRECIO} mensuales</b> a esta cuenta hasta que yo cancele
                la suscripción. Entiendo que puedo cancelarla en cualquier momento desde Ajustes.
              </span>
            </label>
          </div>
        </div>

        <div>
          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.1s" }}>
            <p className="ap-section-title">Tu plan</p>
            <div className="ap-resumen-fila">
              <span>AutoPostula Premium</span>
              <b>{PRECIO}</b>
            </div>
            <div className="ap-resumen-fila ap-resumen-fila--tenue">
              <span>Cobro</span>
              <span>Mensual</span>
            </div>
            <div className="ap-resumen-fila ap-resumen-fila--total">
              <span>Total hoy</span>
              <b>{PRECIO}</b>
            </div>

            <button
              className="ap-gradient-accent ap-boton-pagar"
              disabled={!completo}
              onClick={() => {
                // Todavía no hay a dónde mandarlo: falta decidir si el mandato
                // de cargo automático se registra por Flow o por otro medio.
                avisarError(
                  "Falta conectar el cobro",
                  "El formulario está listo, pero el registro del cargo automático todavía no está enchufado."
                );
              }}
            >
              <Lock size={13} /> Autorizar el cargo
            </button>

            <p className="ap-nota-pago">
              <ShieldCheck size={13} /> Puedes cancelar cuando quieras desde Ajustes.
            </p>
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.15s" }}>
            <p className="ap-section-title">¿Prefieres tarjeta?</p>
            <p className="ap-section-sub" style={{ marginBottom: 12 }}>
              Te llevamos al pago seguro de Flow. Tus datos de tarjeta no pasan por AutoPostula.
            </p>
            <button
              className="ap-button-ghost"
              onClick={pagarConTarjeta}
              disabled={redirigiendo}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center" }}
            >
              <CreditCard size={14} />
              {redirigiendo ? "Un momento…" : "Pagar con tarjeta"}
            </button>
          </div>

          <div className="ap-section ap-animate-in ap-aviso-banco" style={{ animationDelay: "0.2s" }}>
            <Landmark size={15} />
            <p>
              El primer cargo puede tardar hasta 2 días hábiles en aparecer en tu cartola, según el banco.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
