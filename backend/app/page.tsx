import type { Metadata } from "next";
import Link from "next/link";
import { AlignLeft, Check, Highlighter, Info, Plus } from "lucide-react";

import NavLanding from "@/components/landing/NavLanding";
import MesaDemo from "@/components/landing/MesaDemo";
import Papeleo from "@/components/landing/Papeleo";
import BarraMovil from "@/components/landing/BarraMovil";
import Revelar from "@/components/Revelar";
import VolverArriba from "@/components/VolverArriba";
import { Marca } from "@/components/Marca";
import { URL_CHROME_WEB_STORE } from "@/lib/enlaces";
import "./landing.css";

export const metadata: Metadata = {
  title: "Postula a lo que te sirve. Escribe una sola vez.",
  description:
    "AutoPostula revisa las ofertas de Computrabajo, Laborum y Trabajando.com, deja fuera las que no calzan contigo y responde los formularios con tu experiencia real y tus palabras.",
};

const PORTALES = ["Computrabajo", "Laborum", "Trabajando.com"];

/* Solo entra lo que ya es cierto en el código: cada regla tiene detrás un
   arreglo hecho, no una intención. */
const SIEMPRE = [
  {
    t: "Te dice por qué dejó fuera una oferta.",
    d: "Queda lejos de tus comunas, es jefatura, ya postulaste. En palabras, no en puntajes.",
  },
  {
    t: "Te pregunta cuando duda.",
    d: "Las ofertas que calzan a medias quedan en Por decidir, y las resuelves tú, también desde el celular.",
  },
  {
    t: "Responde con tus datos reales.",
    d: "Si le falta uno (licencia, renta, un título), no lo inventa: deja la postulación pendiente hasta que lo completes.",
  },
];

const NUNCA = [
  {
    t: "Te pide la contraseña de un portal.",
    d: "Trabaja dentro de Computrabajo, Laborum y Trabajando.com con tu sesión ya iniciada.",
  },
  {
    t: "Postula dos veces al mismo aviso.",
    d: "Ni cuando la empresa lo vuelve a publicar con otro número.",
  },
  {
    t: "Te descuenta una postulación que no llegó.",
    d: "Si el formulario no se pudo enviar, no cuenta en tu mes.",
  },
  {
    t: "Envía sin que lo veas, si pediste revisar.",
    d: "En modo revisión nada sale sin tu confirmación. Ni después de un rato.",
  },
];

/* El perfil con el que la IA responde, con el origen de cada dato: es lo mismo
   que se ve en /dashboard/perfil. */
const PERFIL = [
  { campo: "Objetivo", valor: "Operario/a de bodega · turno mañana", fuente: "Lo dijiste tú" },
  { campo: "Experiencia", valor: "3 años en bodega: recepción y picking", fuente: "De tu CV" },
  { campo: "Licencias", valor: "Clase D al día · grúa horquilla", fuente: "De tu CV" },
  { campo: "Comunas", valor: "Maipú, Cerrillos, Estación Central", fuente: "Lo dijiste tú" },
  { campo: "Renta", valor: "Desde $600.000 líquidos", fuente: "Lo dijiste tú" },
  {
    campo: "Cómo escribes",
    valor: "Directo, en primera persona, sin adornos",
    fuente: "De la conversación",
  },
];

const CHAT = [
  {
    de: "ia" as const,
    txt: "En el aviso de Comercial Norte preguntan si tienes licencia clase B. En tu CV solo veo la D. ¿La tienes?",
  },
  { de: "tu" as const, txt: "Sí, tengo la B y la D al día." },
  {
    de: "ia" as const,
    txt: "Listo. La guardé en tu perfil y la usé en esa respuesta. No te la vuelvo a preguntar.",
  },
];

const PASOS = [
  {
    donde: "Celular o computador",
    titulo: "Sube tu CV",
    desc: "Lo leemos una vez y armamos tu perfil: experiencia, certificaciones, disponibilidad y tu forma de escribir.",
  },
  {
    donde: "Celular o computador",
    titulo: "Dinos qué buscas y dónde",
    desc: "Cargo, comunas, jornada y sueldo mínimo. Lo declaras tú: no lo adivinamos de tu CV.",
  },
  {
    donde: "Computador con Chrome",
    titulo: "Instala la extensión",
    desc: "Trabaja dentro del portal, con tu propia sesión. Es lo único que necesita computador.",
    enlace: { texto: "Instalar desde Chrome Web Store", href: URL_CHROME_WEB_STORE },
  },
];

/* Los textos de los planes salen de rafagas-y-ponerse-al-dia.md §5: nada de
   "postula sola" sin condiciones. La linea entre planes es quien entra al
   portal, no cuantas postulaciones hace. */
const PLAN_LIBRE = [
  "20 postulaciones al mes",
  "Un portal conectado a la vez",
  "Entras al portal y la extensión postula por ti",
  "Prueba: 5 postulaciones automáticas",
];

const PLAN_PRO = [
  "80 postulaciones al mes",
  "Sin renovación automática: pagas solo cuando lo necesitas",
  "Los tres portales conectados a la vez",
  "Se pone al día sola cada vez que abres tu computador",
  "Perfil dinámico: sigue aprendiendo de tus conversaciones",
];

/* Los miedos reales de quien busca trabajo. La misma lista pinta la sección y
   los datos estructurados, así no se pueden desincronizar. */
const PREGUNTAS = [
  {
    q: "¿Me pueden bloquear la cuenta del portal?",
    r: "La extensión trabaja dentro del portal con tu sesión, una oferta a la vez y a un ritmo parecido al de una persona. No usa tu contraseña ni entra por otro lado.",
  },
  {
    q: "¿Por qué no postula a todas las ofertas?",
    r: "Porque postular a lo que no calza te hace perder tiempo a ti y al reclutador. Deja fuera lo que queda lejos de tus comunas, lo que es de otro nivel o de otro rubro, y lo que ya postulaste. Lo dudoso te lo pregunta.",
  },
  {
    q: "¿Qué pasa si la IA responde mal?",
    r: "Puedes revisar cada respuesta antes de que se envíe y corregirla. Si le falta un dato tuyo, no lo inventa: deja la postulación pendiente hasta que lo completes.",
  },
  {
    q: "¿Funciona en el celular?",
    r: "Desde el celular creas tu cuenta, subes tu CV, conversas con la IA, decides las ofertas que quedaron en Por decidir y ves tus postulaciones. Para postular necesitas Chrome en un computador.",
  },
  {
    q: "¿Tengo que dejar el computador prendido?",
    r: "No. Con Premium se pone al día sola cada vez que abres tu computador, y tú no tienes que hacer nada. Con el plan gratis, la extensión postula mientras estás en el portal.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    r: "Sí, desde Ajustes. Premium sigue activo hasta el fin del mes que pagaste, y después vuelves al plan gratis.",
  },
];

function Tilde({ color }: { color?: string }) {
  return <Check size={15} color={color} strokeWidth={2.6} />;
}

const DATOS_ESTRUCTURADOS = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "AutoPostula",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Chrome",
      inLanguage: "es-CL",
      description:
        "Extensión y panel que revisan las ofertas de Computrabajo, Laborum y Trabajando.com, descartan las que no calzan y responden los formularios con tu CV y tu forma de escribir.",
      url: "https://autopostula.cl",
      offers: [
        { "@type": "Offer", name: "Gratis", price: "0", priceCurrency: "CLP" },
        { "@type": "Offer", name: "Premium", price: "3990", priceCurrency: "CLP" },
      ],
      areaServed: { "@type": "Country", name: "Chile" },
    },
    {
      "@type": "FAQPage",
      mainEntity: PREGUNTAS.map(({ q, r }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: r },
      })),
    },
  ],
};

export default function LandingPage() {
  return (
    <div className="lp">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DATOS_ESTRUCTURADOS) }}
      />
      <Papeleo />
      <NavLanding />

      <main id="inicio" className="lp-encima">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero__grid">
            <div>
              <h1 className="lp-rise lp-rise--2">
                Postula a lo que te sirve.
                <span className="lp-fino">Escribe una sola vez.</span>
              </h1>

              <p className="lp-hero__sub lp-rise lp-rise--3">
                AutoPostula revisa las ofertas de Computrabajo, Laborum y Trabajando.com, deja
                fuera las que no calzan contigo y responde los formularios con tu experiencia real.
                Tú revisas y envías, o deja que se ponga al día sola cada vez que abres tu
                computador.
              </p>

              <div className="lp-hero__cta lp-rise lp-rise--4">
                <Link className="ap-btn ap-btn--primary" href="/registro">
                  Crear cuenta gratis
                </Link>
                <a className="ap-btn ap-btn--ghost" href="#reglas">
                  Ver cómo decide
                </a>
              </div>
              <p className="lp-hero__sub lp-rise lp-rise--4" style={{ fontSize: 13, marginTop: 12 }}>
                Es una extensión de Chrome:{" "}
                <a className="ap-enlace" href={URL_CHROME_WEB_STORE} target="_blank" rel="noreferrer">
                  instálala desde la Chrome Web Store&nbsp;↗
                </a>
              </p>

              <div className="lp-datos lp-rise lp-rise--5">
                <span>
                  <span className="lp-dato__n">20</span>
                  <span className="lp-dato__l">gratis al mes</span>
                </span>
                <span>
                  <span className="lp-dato__n">3</span>
                  <span className="lp-dato__l">portales</span>
                </span>
                <span>
                  <span className="lp-dato__n">0</span>
                  <span className="lp-dato__l">claves de portal que te pedimos</span>
                </span>
              </div>
            </div>

            <MesaDemo />
          </div>
        </section>

        {/* ── Dónde funciona ───────────────────────────────────── */}
        <div className="lp-portales">
          <div className="lp-wrap lp-portales__in">
            <span className="lp-portales__l">Funciona dentro de</span>
            {PORTALES.map((n) => (
              <span className="lp-portales__n" key={n}>{n}</span>
            ))}
          </div>
        </div>

        {/* ── Siempre / nunca ──────────────────────────────────── */}
        <section className="lp-band" id="reglas">
          <div className="lp-wrap">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>
                Lo que hace siempre. <span className="lp-fino">Lo que no hace nunca.</span>
              </h2>
              <p>
                No postula a todo. Postular a lo que no calza te quita tiempo a ti y le quita
                paciencia al reclutador que lee tu nombre.
              </p>
            </Revelar>

            <Revelar className="lp-reglas" retraso={1}>
              <div className="lp-reglas__col lp-reglas__col--si">
                <h3>Siempre</h3>
                {SIEMPRE.map(({ t, d }) => (
                  <div className="lp-regla" key={t}>
                    <span className="lp-regla__s" aria-hidden="true">✓</span>
                    <p className="lp-regla__t">{t}</p>
                    <p className="lp-regla__d">{d}</p>
                  </div>
                ))}
              </div>
              <div className="lp-reglas__col lp-reglas__col--no">
                <h3>Nunca</h3>
                {NUNCA.map(({ t, d }) => (
                  <div className="lp-regla" key={t}>
                    <span className="lp-regla__s" aria-hidden="true">—</span>
                    <p className="lp-regla__t">{t}</p>
                    <p className="lp-regla__d">{d}</p>
                  </div>
                ))}
              </div>
            </Revelar>
          </div>
        </section>

        {/* ── La diferencia ────────────────────────────────────── */}
        <section className="lp-band lp-band--sheet" id="diferencia">
          <div className="lp-wrap">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>La misma pregunta. <span className="lp-fino">Dos respuestas.</span></h2>
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
                  Lo marcado sale de tu CV y de tu conversación con la IA. Si le falta un dato tuyo,
                  no lo inventa: te lo pide. Revisa antes de enviar: la IA puede equivocarse.
                </p>
              </article>
            </Revelar>
          </div>
        </section>

        {/* ── Perfil y conversación ────────────────────────────── */}
        <section className="lp-band" id="perfil">
          <div className="lp-wrap">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>
                El perfil se arma solo. <span className="lp-fino">Tú lo afinas conversando.</span>
              </h2>
              <p>
                Tu CV entra una vez y se convierte en el perfil con el que la IA responde por ti.
                Lo que falta no lo inventa: te lo pregunta conversando, lo guarda y no te lo vuelve
                a preguntar. Esa misma conversación es la que le enseña a escribir como tú.
              </p>
            </Revelar>

            <Revelar className="lp-perfil" retraso={1}>
              <article className="lp-tarjeta">
                <div className="lp-tarjeta__bar">
                  <span className="lp-tarjeta__t">Tu perfil</span>
                  <span className="lp-tarjeta__m">Lo que la IA usa para responder</span>
                </div>
                <dl className="lp-campos">
                  {PERFIL.map(({ campo, valor, fuente }) => (
                    <div className="lp-campo-fila" key={campo}>
                      <dt>{campo}</dt>
                      <dd>
                        {valor}
                        <span className="lp-origen">{fuente}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>

              <article className="lp-tarjeta">
                <div className="lp-tarjeta__bar">
                  <span className="lp-tarjeta__t">Conversación con la IA</span>
                  <span className="lp-tarjeta__m">Cuando falta un dato</span>
                </div>
                <div className="lp-hilo">
                  {CHAT.map(({ de, txt }, i) => (
                    <div className="lp-burbuja" data-de={de} key={i}>
                      <span className="lp-burbuja__quien">{de === "ia" ? "AP" : "Tú"}</span>
                      <p className="lp-burbuja__texto">{txt}</p>
                    </div>
                  ))}
                </div>
                <p className="lp-hilo__pie">
                  Y si una respuesta no suena a ti, se la corriges: más corta, más formal, más
                  cercana. Cada corrección queda en tu perfil para la próxima.
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
              <p>
                Tres pasos, y los dos primeros los haces desde el celular. Después no vuelves a
                escribir una carta de presentación.
              </p>
            </Revelar>

            <Revelar className="lp-pasos" retraso={1}>
              {PASOS.map(({ donde, titulo, desc, enlace }, i) => (
                <div className="lp-paso" key={titulo}>
                  <span className="lp-paso__line" />
                  <span className="lp-paso__n ap-tnum">{i + 1}</span>
                  <span className="lp-paso__donde">{donde}</span>
                  <h3>{titulo}</h3>
                  <p>{desc}</p>
                  {enlace && (
                    <p>
                      <a className="ap-enlace" href={enlace.href} target="_blank" rel="noreferrer">
                        {enlace.texto}&nbsp;↗
                      </a>
                    </p>
                  )}
                </div>
              ))}
            </Revelar>
          </div>
        </section>

        {/* ── Precios ──────────────────────────────────────────── */}
        <section className="lp-band" id="precios">
          <div className="lp-wrap">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>Precios simples.</h2>
              <p>Empieza gratis. Pasa a Premium cuando quieras que se ponga al día sola.</p>
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

            <Revelar className="lp-planes__pie" retraso={2}>
              En los dos planes, una postulación que no llegó al portal no cuenta en tu mes.
            </Revelar>
          </div>
        </section>

        {/* ── Preguntas ────────────────────────────────────────── */}
        <section className="lp-band lp-band--sheet" id="preguntas">
          <div className="lp-wrap lp-faq">
            <Revelar className="lp-head">
              <div className="lp-head__rule" />
              <h2>Lo que todos <span className="lp-fino">preguntan.</span></h2>
            </Revelar>

            <Revelar className="lp-faq__lista" retraso={1}>
              {PREGUNTAS.map(({ q, r }, i) => (
                <details key={q} open={i === 0}>
                  <summary>
                    {q}
                    <Plus size={18} strokeWidth={2} />
                  </summary>
                  <p className="lp-faq__r">{r}</p>
                </details>
              ))}
            </Revelar>
          </div>
        </section>

        {/* ── Cierre ───────────────────────────────────────────── */}
        <section className="lp-band lp-cierre">
          <div className="lp-wrap lp-cierre__grid">
            <div>
              <h2>Deja de llenar formularios a mano.</h2>
              <p>
                Crea tu cuenta, sube tu CV y dinos qué buscas. Después abres tu portal de siempre y
                ella se encarga.
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
      <footer className="lp-pie lp-encima">
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
      <BarraMovil />
    </div>
  );
}
