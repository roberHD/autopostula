import type { Metadata } from "next";
import Link from "next/link";
import { AlignLeft, Check, Highlighter, Info } from "lucide-react";

import NavLanding from "@/components/landing/NavLanding";
import FichaDemo from "@/components/landing/FichaDemo";
import Revelar from "@/components/Revelar";
import VolverArriba from "@/components/VolverArriba";
import { Marca } from "@/components/Marca";
import "./landing.css";

export const metadata: Metadata = {
  title: "Postula 80 veces al mes. Escribe una sola.",
  description:
    "AutoPostula lee tu CV, aprende cómo escribes y responde los formularios de Computrabajo y Laborum con tus palabras. Tú revisas y envías, o lo dejas corriendo solo.",
};

// Cargos reales de los portales chilenos: la tira es textura, pero textura
// del rubro de la persona que está mirando.
const CARGOS = [
  ["Operario/a de bodega", "Quilicura"],
  ["Ejecutivo/a de call center", "Santiago Centro"],
  ["Auxiliar de aseo", "Providencia"],
  ["Vendedor/a integral", "Maipú"],
  ["Cajero/a part time", "La Florida"],
  ["Asistente contable", "Las Condes"],
  ["Conductor clase B", "San Bernardo"],
  ["Guardia de seguridad OS10", "Puente Alto"],
  ["Reponedor/a de sala", "Ñuñoa"],
  ["Secretaria administrativa", "Viña del Mar"],
];

const PASOS = [
  {
    titulo: "Sube tu CV",
    desc: "Lo leemos una vez y armamos tu perfil: experiencia, certificaciones, disponibilidad y tu forma de escribir.",
  },
  {
    titulo: "Instala la extensión",
    desc: "Conecta tu cuenta de Computrabajo o Laborum. La extensión trabaja dentro del portal, con tu sesión.",
  },
  {
    titulo: "Define qué te sirve",
    desc: "Rubro, comuna, jornada y sueldo mínimo. De ahí en adelante postula sola y tú revisas el historial.",
  },
];

const PIPELINE = [
  { estado: "Enviado", n: 76, w: "100%", color: "var(--status-enviado)" },
  { estado: "Visto", n: 46, w: "61%", color: "var(--status-visto)" },
  { estado: "En proceso", n: 18, w: "24%", color: "var(--status-en-proceso)" },
  { estado: "Finalista", n: 7, w: "9%", color: "var(--status-finalista)" },
  { estado: "Rechazado", n: 11, w: "15%", color: "var(--status-rechazado)" },
];

const SEMANA = [
  { dia: "Lun", h: "52%" },
  { dia: "Mar", h: "78%" },
  { dia: "Mié", h: "39%" },
  { dia: "Jue", h: "96%" },
  { dia: "Vie", h: "65%" },
];

const PLAN_LIBRE = [
  "20 postulaciones al mes",
  "Un portal conectado a la vez",
  "Postulación asistida: la IA responde, tú envías",
];

const PLAN_PRO = [
  "80 postulaciones al mes",
  "Computrabajo y Laborum conectados a la vez",
  "Busca y postula sola, según tus filtros",
  "Perfil dinámico e instrucciones propias",
];

function Tilde({ color }: { color?: string }) {
  return <Check size={15} color={color} strokeWidth={2.6} />;
}

export default function LandingPage() {
  return (
    <div className="lp">
      <NavLanding />

      <main id="inicio">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero__grid">
            <div>
              <span className="lp-flag lp-rise lp-rise--1">
                <i />
                Computrabajo y Laborum, conectados
              </span>

              <h1 className="lp-rise lp-rise--2">
                Postula 80 veces al mes.
                <br />
                <span className="ap-swipe ap-swipe--auto">Escribe una sola.</span>
              </h1>

              <p className="lp-hero__sub lp-rise lp-rise--3">
                AutoPostula lee tu CV, aprende cómo escribes y responde cada formulario con tus
                palabras y tu experiencia real. Tú revisas y envías, o lo dejas corriendo solo.
              </p>

              <div className="lp-hero__cta lp-rise lp-rise--4">
                <Link className="ap-btn ap-btn--primary" href="/registro">
                  Crear cuenta gratis
                </Link>
                <a className="ap-btn ap-btn--ghost" href="#pasos">
                  Ver cómo funciona
                </a>
              </div>

              <div className="lp-terms lp-rise lp-rise--5">
                <span className="lp-term">
                  <Check strokeWidth={2.6} /> 20 postulaciones gratis al mes
                </span>
                <span className="lp-term">
                  <Check strokeWidth={2.6} /> Sin tarjeta de crédito
                </span>
              </div>
            </div>

            <FichaDemo />
          </div>
        </section>

        {/* ── Tira de avisos ───────────────────────────────────── */}
        <div className="lp-tira" aria-hidden="true">
          <div className="lp-tira__row">
            {/* Duplicada para que el loop no corte al llegar al final. */}
            {[...CARGOS, ...CARGOS].map(([cargo, comuna], i) => (
              <span className="lp-tira__item" key={`${cargo}-${i}`}>
                <b>{cargo}</b> {comuna}
              </span>
            ))}
          </div>
        </div>

        {/* ── La diferencia ────────────────────────────────────── */}
        <section className="lp-band" id="diferencia">
          <div className="lp-wrap">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>La misma pregunta, dos respuestas.</h2>
              <p>
                Todos los portales preguntan lo mismo. La diferencia está en si la respuesta
                podría ser de cualquiera, o solamente tuya.
              </p>
            </Revelar>

            <Revelar className="lp-versus" retraso={1}>
              <article className="lp-hoja lp-hoja--gris">
                <p className="lp-hoja__tag">
                  <AlignLeft size={15} />
                  Lo que manda todo el mundo
                </p>
                <p className="lp-hoja__txt">
                  Estimados, me dirijo a ustedes con el fin de postular al cargo publicado.
                  Cuento con amplia experiencia en el área y soy una persona responsable,
                  proactiva y con gran capacidad de trabajo en equipo.
                </p>
                <p className="lp-fuente">
                  <Info size={14} />
                  Sin un solo dato que el reclutador no haya leído hoy 40 veces.
                </p>
              </article>

              <article className="lp-hoja lp-hoja--tuya">
                <p className="lp-hoja__tag">
                  <Marca tam={20} />
                  Lo que mandas tú
                </p>
                <p className="lp-hoja__txt">
                  Trabajé <span className="ap-mk">3 años en bodega en Maipú</span>, recepción y
                  picking. Tengo <span className="ap-mk">licencia D al día</span> y manejo grúa
                  horquilla. Vivo a 20 minutos de Quilicura, así que el{" "}
                  <span className="ap-mk">turno de mañana</span> me acomoda bien.
                </p>
                <p className="lp-fuente">
                  <Highlighter size={14} />
                  Lo marcado salió de tu CV y de tu calibración de estilo. Nada inventado.
                </p>
              </article>
            </Revelar>
          </div>
        </section>

        {/* ── Pasos ────────────────────────────────────────────── */}
        <section className="lp-band lp-band--sheet" id="pasos">
          <div className="lp-wrap">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>Se configura una vez.</h2>
              <p>Después de estos tres pasos no vuelves a escribir una carta de presentación.</p>
            </Revelar>

            <Revelar className="lp-pasos" retraso={1}>
              {PASOS.map(({ titulo, desc }, i) => (
                <div className="lp-paso" key={titulo}>
                  <span className="lp-paso__line" />
                  <span className="lp-paso__n ap-tnum">{i + 1}</span>
                  <h3>{titulo}</h3>
                  <p>{desc}</p>
                </div>
              ))}
            </Revelar>
          </div>
        </section>

        {/* ── Tablero ──────────────────────────────────────────── */}
        <section className="lp-band">
          <div className="lp-wrap">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>Sabes en qué quedó cada una.</h2>
              <p>
                Cada postulación queda registrada con su estado real, actualizado desde el portal.
                Se acabó el &ldquo;¿a esta ya postulé?&rdquo;.
              </p>
            </Revelar>

            <Revelar className="lp-tablero" retraso={1}>
              <div className="lp-tablero__bar">
                <span className="lp-tablero__t">Tus postulaciones</span>
                <span className="lp-tablero__meta ap-tnum">Últimos 30 días · 76 enviadas</span>
              </div>

              <div className="lp-tablero__in">
                <div className="lp-pipe">
                  {PIPELINE.map(({ estado, n, w, color }) => (
                    <div className="lp-pipe__row" key={estado}>
                      <span className="lp-pipe__lab">
                        <i style={{ color }} />
                        {estado}
                      </span>
                      <span className="lp-pipe__track">
                        <span
                          className="lp-pipe__fill"
                          style={{ ["--w" as string]: w, color }}
                        />
                      </span>
                      <span className="lp-pipe__n ap-tnum">{n}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="lp-semana">
                    {SEMANA.map(({ dia, h }) => (
                      <div
                        className={`lp-dia${h === "96%" ? " lp-dia--alto" : ""}`}
                        key={dia}
                      >
                        <span className="lp-dia__bar" style={{ ["--h" as string]: h }} />
                        <span className="lp-dia__l">{dia}</span>
                      </div>
                    ))}
                  </div>
                  <p className="lp-semana__cap ap-tnum">
                    Esta semana · máximo 22 el jueves, 15 el viernes
                  </p>
                </div>
              </div>
            </Revelar>
          </div>
        </section>

        {/* ── Precios ──────────────────────────────────────────── */}
        <section className="lp-band lp-band--sheet" id="precios">
          <div className="lp-wrap">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>Precios simples.</h2>
              <p>Empieza gratis. Pasa a Premium cuando quieras que postule sola.</p>
            </Revelar>

            <Revelar className="lp-planes" retraso={1}>
              <article className="lp-plan lp-plan--libre">
                <p className="lp-plan__n">Gratis</p>
                <p className="lp-plan__p ap-tnum">$0</p>
                <ul className="lp-plan__list">
                  {PLAN_LIBRE.map((item) => (
                    <li key={item}>
                      <Tilde />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link className="ap-btn ap-btn--ghost ap-btn--full" href="/registro">
                  Crear cuenta gratis
                </Link>
              </article>

              <article className="lp-plan lp-plan--pro">
                <p className="lp-plan__n">Premium</p>
                <p className="lp-plan__p ap-tnum">
                  $3.990 <small>al mes</small>
                </p>
                <ul className="lp-plan__list">
                  {PLAN_PRO.map((item) => (
                    <li key={item}>
                      <Tilde />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link className="ap-btn ap-btn--mark ap-btn--full" href="/registro?plan=premium">
                  Empezar con Premium
                </Link>
              </article>
            </Revelar>
          </div>
        </section>

        {/* ── Cierre ───────────────────────────────────────────── */}
        <section className="lp-band lp-cierre">
          <div className="lp-wrap lp-cierre__grid">
            <div>
              <h2>Deja de llenar formularios a mano.</h2>
              <p>
                Crea tu cuenta, sube tu CV y postula a tu primera oferta en menos de diez minutos.
              </p>
            </div>
            <Link
              className="ap-btn ap-btn--mark"
              href="/registro"
              style={{ padding: "16px 28px", fontSize: 15 }}
            >
              Crear cuenta gratis
            </Link>
          </div>
        </section>
      </main>

      {/* ── Pie ────────────────────────────────────────────────── */}
      <footer className="lp-pie">
        <div className="lp-wrap lp-pie__in">
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <Link href="/" className="ap-brand">
              <Marca />
              <b>AutoPostula</b>
            </Link>
            <small className="ap-tnum">© {new Date().getFullYear()}</small>
          </div>
          <div className="lp-pie__links">
            <Link href="/terminos">Términos y condiciones</Link>
            <Link href="/privacidad">Privacidad</Link>
          </div>
        </div>
      </footer>

      <VolverArriba />
    </div>
  );
}
