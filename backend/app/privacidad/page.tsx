import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos personales recolecta AutoPostula, para qué los usa, con quién los comparte y cómo ejercer tus derechos.",
};

export default function PrivacidadPage() {
  return (
    <LegalPage titulo="Política de privacidad" actualizado="11 de octubre de 2026">
      <p>
        Esta política explica qué datos personales recolecta AutoPostula, con qué finalidad los
        usa, con quién los comparte y cómo puedes ejercer tus derechos sobre ellos. Aplica al
        sitio web, al panel de usuario y a la extensión de Chrome, y a todas las personas que crean
        una cuenta en AutoPostula para buscar trabajo.
      </p>
      <p>
        <strong>Versión 2026-10-11.</strong> Se rige por la Ley N° 19.628 sobre protección de la
        vida privada, con las modificaciones de la Ley N° 21.719.
      </p>

      <h2>1. Quién es responsable de tus datos</h2>
      <p>
        El responsable del tratamiento de tus datos personales es{" "}
        <strong>Roberto Andrés Hidalgo Bizama</strong>, RUT{" "}
        <strong>21.723.850-1</strong>, domiciliado en <strong>Las Condes, Chile</strong>,
        en adelante &ldquo;AutoPostula&rdquo;.
      </p>
      <p>
        Para cualquier consulta sobre esta política o sobre tus datos, y para ejercer tus derechos
        (ver 9), escríbenos a <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a> o
        desde el formulario de Soporte de tu panel.
      </p>

      <h2>2. Qué datos recolectamos</h2>
      <p>
        Casi todo lo que guardamos lo entregas tú: al crear tu cuenta, al subir tu CV, al completar
        tu perfil y al usar la extensión. Si entras con Google, Google nos entrega tu nombre y tu
        correo. De los portales solo tomamos los avisos de trabajo, que son públicos.
      </p>

      <h3>2.1 Datos de tu cuenta</h3>
      <ul>
        <li>Correo electrónico y nombre.</li>
        <li>
          Si creas tu cuenta con correo y contraseña, la contraseña se almacena siempre como{" "}
          <strong>hash</strong> (bcrypt). Nunca guardamos ni podemos ver tu contraseña en texto
          plano.
        </li>
        <li>
          Si entras con <strong>Google</strong>, Google nos entrega tu nombre y tu correo. No
          recibimos tu contraseña de Google ni ningún otro dato de esa cuenta.
        </li>
        <li>Si confirmaste tu correo electrónico, y en qué fecha.</li>
        <li>Fecha de creación de la cuenta.</li>
        <li>
          Que aceptaste los términos y esta política, y que declaraste tener 18 años o más: qué
          versión aceptaste y cuándo. También si autorizaste o retiraste la autorización de datos
          sensibles de tu CV (ver 2.2). La ley nos pide poder demostrar tu consentimiento.
        </li>
        <li>Cómo nos conociste, si respondes esa pregunta al crear tu cuenta (es opcional).</li>
      </ul>

      <h3>2.2 Datos de tu perfil profesional</h3>
      <p>
        Cuando subes tu currículum, extraemos su texto y lo guardamos junto con los datos que
        completas en tu perfil:
      </p>
      <ul>
        <li>Nombre, correo, teléfono y comuna.</li>
        <li>RUT.</li>
        <li>
          Los cargos que buscas, expectativa de renta, disponibilidad y modalidad de trabajo.
        </li>
        <li>Resumen profesional, experiencia laboral y habilidades.</li>
        <li>El texto completo extraído de tu CV y el nombre del archivo original.</li>
        <li>
          Los datos sueltos que agregas para responder formularios (por ejemplo, si tienes licencia
          de conducir o desde cuándo puedes empezar).
        </li>
      </ul>
      <div className="nota">
        <p>
          <strong>No almacenamos el archivo PDF de tu CV.</strong> Al subirlo extraemos su texto y
          descartamos el archivo; solo conservamos ese texto y el nombre del archivo.
        </p>
      </div>
      <div className="nota">
        <p>
          <strong>Datos sensibles.</strong> Un CV puede traer datos que la ley considera sensibles,
          como de salud, discapacidad, origen étnico o situación socioeconómica. Por eso, antes de
          subirlo te pedimos tu <strong>autorización expresa</strong> para tratarlos, solo para
          completar tus postulaciones. Puedes retirarla cuando quieras desde Perfil; al hacerlo
          borramos tu CV. Si prefieres, quita esos datos de tu CV antes de subirlo.
        </p>
      </div>

      <h3>2.3 Datos de tu perfil de estilo</h3>
      <p>
        Si usas la conversación con la IA para definir tu estilo de respuesta, guardamos tu
        objetivo laboral, motivaciones, fortalezas, tus respuestas a las preguntas de calibración y
        las preferencias de tono y longitud que resulten de esa conversación. Según tu plan,
        también podemos conservar el historial de esa conversación para que puedas retomarla.
      </p>
      <div className="nota">
        <p>
          <strong>Dictado por voz.</strong> Si usas el micrófono para dictar en la conversación, la
          transcripción la hace <strong>tu navegador, no AutoPostula</strong>. En Google Chrome eso
          significa que el audio se envía a los servidores de Google para convertirlo en texto.
          Nosotros no recibimos ni guardamos el audio: solo el texto que queda escrito, igual que si
          lo hubieras tecleado. Si prefieres que tu voz no salga de tu computador, escribe en vez de
          dictar.
        </p>
      </div>

      <h3>2.4 Datos de tus postulaciones</h3>
      <ul>
        <li>Qué portales conectaste a tu cuenta.</li>
        <li>Ofertas a las que postulaste: título, empresa, enlace y portal.</li>
        <li>
          Las preguntas de cada formulario, la respuesta que propuso la IA, la versión que
          finalmente se envió y si la editaste antes de enviarla.
        </li>
        <li>Estado de cada postulación y su historial de cambios.</li>
        <li>Registro de las llamadas a la IA realizadas, para controlar los límites de tu plan.</li>
        <li>
          El registro de cada puesta al día automática (ver 6): cuándo empezó y terminó, qué la
          disparó y cuántas ofertas postuló, descartó o dejó esperando tu decisión. También cuándo
          conectaste la extensión.
        </li>
        <li>
          En el plan gratuito, cuántas de tus 5 postulaciones automáticas de prueba te quedan y
          cuáles fueron.
        </li>
      </ul>

      <h3>2.5 Ofertas que la extensión revisa</h3>
      <p>
        Para poder decidir a qué postular, la extensión revisa las ofertas que aparecen en los
        resultados de búsqueda de los portales. De cada una guardamos el título, la empresa, el
        enlace y el portal, <strong>aunque no postules a ella</strong>.
      </p>
      <p>
        Las ofertas a las que no postulas y sobre las que no tomas ninguna decisión{" "}
        <strong>no quedan asociadas a tu cuenta</strong>: se guardan como un listado de avisos
        públicos, sin registro de quién los vio.
      </p>
      <p>Esa información se usa para dos cosas:</p>
      <ul>
        <li>
          <strong>No procesar varias veces la misma oferta.</strong>
        </li>
        <li>
          <strong>Mejorar el reconocimiento de cargos.</strong> Los títulos de las ofertas —sin
          ningún dato tuyo asociado— alimentan un diccionario compartido que nos permite entender
          que, por ejemplo, &ldquo;asesor comercial&rdquo; y &ldquo;vendedor&rdquo; son lo mismo.
          Ese diccionario contiene solo nombres de cargos publicados por las empresas en avisos
          públicos, nunca información de usuarios.
        </li>
        <li>
          <strong>Contarte qué dejó fuera y por qué.</strong> De las ofertas que AutoPostula descarta
          por ti guardamos el cargo, la empresa, el enlace y la razón (por ejemplo, &ldquo;queda
          fuera de tus comunas&rdquo;), para mostrártelas en tu panel y que puedas corregir un
          descarte. Si lo corriges, AutoPostula postula a esa oferta y lo usa para afinar tu perfil.
        </li>
      </ul>
      <div className="nota">
        <p>
          Las ofertas revisadas a las que <strong>nunca postulaste</strong> y sobre las que no
          tomaste una decisión se eliminan a los <strong>90 días</strong>.
        </p>
      </div>

      <h3>2.6 Tus preferencias sobre qué ofertas te interesan</h3>
      <p>
        Cuando marcas si postularías o no a una oferta —en el paso de preferencias al crear tu
        cuenta, o en la lista de ofertas que quedan pendientes de tu decisión— guardamos esa
        respuesta junto con el título, la empresa y el enlace de la oferta.
      </p>
      <p>
        Para las ofertas que quedan esperando tu decisión guardamos además el puntaje que
        obtuvieron, las razones por las que no quedaron claras y el detalle que la extensión leyó
        del aviso: comuna, jornada, modalidad, tipo de contrato, sueldo si el aviso lo publica,
        antigüedad del aviso, valoración de la empresa en el portal y un extracto de la
        descripción. Es información del aviso, no tuya, pero queda asociada a tu cuenta porque es
        lo que te mostramos para que decidas.
      </p>
      <p>
        Con tus respuestas, más tu CV y lo que hayas conversado con la IA, armamos un{" "}
        <strong>perfil de búsqueda</strong>: una lista de los cargos que te interesan, los que
        quieres evitar y tus preferencias de comuna, jornada y modalidad. Ese perfil es lo que la
        extensión usa para decidir a qué postular, y se recalcula cuando cambias algo.
      </p>
      <p>
        Si revisas una tanda de ofertas en el panel de revisión que la extensión muestra dentro del
        portal, guardamos a cuáles decidiste postular y a cuáles no, junto con lo que el sistema había
        propuesto, para aprender de tus correcciones.
      </p>

      <h3>2.7 Datos de pago</h3>
      <p>
        Si compras un pase Premium, guardamos el número de orden de la pasarela de pagos, el
        monto, la fecha y el estado de cada pago. No guardamos ningún identificador de cliente de
        la pasarela: cada pase es un pago único.
      </p>
      <div className="nota">
        <p>
          <strong>No recibimos, procesamos ni almacenamos los datos de tu tarjeta.</strong> Esa
          información la maneja directamente Flow, nuestra pasarela de pagos, en sus propios
          sistemas.
        </p>
      </div>

      <h3>2.8 Mensajes de soporte</h3>
      <p>
        Si nos escribes desde el formulario de contacto, recibimos tu mensaje, las imágenes que
        adjuntes (hasta tres), tu nombre, tu correo y la página desde la que escribiste. Nos llega
        como un correo a nuestra casilla de soporte, para poder responderte.{" "}
        <strong>No se guarda en la base de datos de AutoPostula.</strong>
      </p>

      <h3>2.9 Monedas, invitaciones y postulaciones extra</h3>
      <ul>
        <li>
          <strong>Monedas.</strong> Ganas una moneda por cada hora en que usas AutoPostula, con el
          panel abierto y a la vista o con la extensión encendida, y una al día por conversar 10
          minutos con la IA. Para contarlas registramos la hora en que hubo uso y los minutos en que
          enviaste mensajes en la conversación; no registramos qué hiciste en esa hora.
        </li>
        <li>
          <strong>Invitaciones.</strong> Tu código de invitación, quién te invitó si llegaste por un
          enlace, y cuántas personas invitaste tú.
        </li>
        <li>
          <strong>Postulaciones extra.</strong> Las que compraste, ganaste o usaste, con la fecha y
          el motivo de cada movimiento.
        </li>
      </ul>

      <h3>2.10 Estadísticas del sitio</h3>
      <p>
        Usamos <strong>Vercel Web Analytics</strong> para saber cuántas personas visitan cada
        página y desde qué sitio llegan. Registra la página visitada, el sitio de origen, el país y
        el tipo de dispositivo y navegador. <strong>No usa cookies</strong> ni nos permite saber
        quién eres: no ve tu cuenta, no graba tus sesiones ni lo que escribes.
      </p>

      <h3>2.11 Lo que NO recolectamos</h3>
      <ul>
        <li>
          <strong>
            No pedimos ni almacenamos las contraseñas de Computrabajo, Laborum ni Trabajando.com.
          </strong>{" "}
          La extensión trabaja sobre la sesión que tú ya iniciaste en esos portales desde tu propio
          navegador.
        </li>
        <li>
          No leemos tu historial de navegación. La extensión solo mira la dirección de tus pestañas
          para saber si están en un portal compatible, y no la guarda ni la envía.
        </li>
        <li>
          No accedemos a ningún sitio web fuera de Computrabajo, Laborum, Trabajando.com y el propio
          sitio de AutoPostula.
        </li>
        <li>No recibimos ni guardamos el audio del dictado por voz (ver 2.3).</li>
        <li>No grabamos tus sesiones ni hacemos mapas de lo que tocas en la pantalla.</li>
        <li>No vendemos tus datos a nadie, bajo ninguna circunstancia.</li>
      </ul>

      <h2>3. Para qué usamos tus datos, y con qué base legal</h2>
      <p>
        Cada uso de tus datos tiene una base que la ley permite. <strong>Contrato</strong> significa
        que el dato es necesario para prestarte el servicio que pediste al crear tu cuenta y aceptar
        los <a href="/terminos">términos</a>. <strong>Consentimiento</strong> es algo que nos
        autorizaste tú y que puedes retirar. <strong>Interés legítimo</strong> es un interés nuestro
        que no afecta tus derechos (más abajo decimos cuáles). <strong>Obligación legal</strong> es lo
        que la ley nos exige guardar.
      </p>
      <table>
        <thead>
          <tr>
            <th>Dato</th>
            <th>Finalidad</th>
            <th>Base legal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Correo y contraseña</td>
            <td>Autenticarte y permitirte recuperar el acceso a tu cuenta.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Confirmación del correo</td>
            <td>Asegurar que la cuenta que conecta la extensión o contrata un plan pertenece a una dirección real.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Aceptación de los términos, esta política y tus autorizaciones</td>
            <td>Poder demostrar que diste tu consentimiento, y con qué versión.</td>
            <td>Obligación legal</td>
          </tr>
          <tr>
            <td>CV y perfil profesional</td>
            <td>Completar automáticamente los formularios de postulación y generar respuestas.</td>
            <td>Contrato; los datos sensibles del CV, tu consentimiento expreso</td>
          </tr>
          <tr>
            <td>Filtros y perfil de búsqueda</td>
            <td>Decidir a qué ofertas postular y cuáles descartar.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Ofertas revisadas</td>
            <td>No procesar dos veces la misma oferta y mejorar el reconocimiento de cargos.</td>
            <td>Interés legítimo</td>
          </tr>
          <tr>
            <td>Tus preferencias y el detalle de las ofertas por decidir</td>
            <td>Mostrarte lo que necesitas para decidir, aprender qué cargos te interesan y afinar el perfil de búsqueda.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Perfil de estilo</td>
            <td>Ajustar el tono y la extensión de las respuestas generadas.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Respuestas propuestas por la IA y tus correcciones</td>
            <td>Mejorar las respuestas futuras a partir de cómo corriges las que genera la IA.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Historial de postulaciones</td>
            <td>Mostrarte tu actividad y evitar postular dos veces a lo mismo.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Registro de puestas al día y fecha en que conectaste la extensión</td>
            <td>Mostrarte cuándo se puso al día por última vez y cuánto suele tardar. Con Premium, además, avisarte por correo si lleva 48 horas o más sin hacerlo (ver 6).</td>
            <td>Contrato; los recordatorios por correo, interés legítimo</td>
          </tr>
          <tr>
            <td>Tus postulaciones automáticas de prueba</td>
            <td>Contar las 5 de la prueba gratuita, mostrártelas y avisarte por correo cuando la prueba termina.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Registro de uso de IA</td>
            <td>Aplicar los límites mensuales de tu plan.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Monedas, invitaciones y postulaciones extra</td>
            <td>Darte las monedas y los premios que te corresponden, y descontar las postulaciones extra que usas.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Cómo nos conociste</td>
            <td>Saber por qué canales llega la gente a AutoPostula.</td>
            <td>Consentimiento (responder es opcional)</td>
          </tr>
          <tr>
            <td>Datos de pago</td>
            <td>Activar tu pase y emitir el comprobante.</td>
            <td>Contrato y obligación legal (tributaria)</td>
          </tr>
          <tr>
            <td>Mensajes de soporte</td>
            <td>Responder tu consulta o resolver el problema que reportaste.</td>
            <td>Contrato</td>
          </tr>
          <tr>
            <td>Estadísticas del sitio</td>
            <td>Saber qué páginas se visitan y de dónde llega la gente, sin identificar a nadie.</td>
            <td>Interés legítimo</td>
          </tr>
          <tr>
            <td>Registro de intentos de inicio de sesión, registro y recuperación</td>
            <td>Frenar a quien prueba contraseñas o crea cuentas en masa.</td>
            <td>Interés legítimo</td>
          </tr>
        </tbody>
      </table>
      <p>Nuestros intereses legítimos son estos, y en ninguno usamos tus datos para algo distinto:</p>
      <ul>
        <li>
          <strong>Que el servicio funcione bien:</strong> no revisar dos veces la misma oferta y
          entender que distintos títulos de avisos son el mismo cargo, con títulos públicos que no
          llevan ningún dato tuyo.
        </li>
        <li>
          <strong>Saber cómo se usa el sitio:</strong> estadísticas de visitas agregadas y sin
          cookies, que no identifican a nadie.
        </li>
        <li>
          <strong>Proteger las cuentas:</strong> limitar los intentos de inicio de sesión, de
          registro y de recuperación de contraseña.
        </li>
        <li>
          <strong>Recordarte que la extensión no se ha puesto al día</strong>, si tienes Premium.
          Cada correo trae un enlace para dejar de recibirlos.
        </li>
      </ul>
      <p>
        Siempre puedes pedirnos que te expliquemos un tratamiento basado en interés legítimo, y
        oponerte a él (ver 9).
      </p>

      <h2>4. Uso de inteligencia artificial</h2>
      <p>
        AutoPostula usa modelos de lenguaje de <strong>Anthropic</strong> (Claude) para analizar
        avisos de trabajo y redactar las respuestas de los formularios de postulación.
      </p>
      <p>Para que eso funcione, enviamos a la API de Anthropic:</p>
      <ul>
        <li>El texto extraído de tu CV.</li>
        <li>Los datos de tu perfil profesional y tu perfil de estilo.</li>
        <li>El texto del aviso de trabajo y las preguntas del formulario.</li>
        <li>
          Tu perfil de búsqueda (ver 2.6), cuando lo recalculamos a partir de tus preferencias.
        </li>
      </ul>
      <p>
        Estos datos se envían únicamente en el momento de procesar una postulación o de recalcular
        tu perfil, y con el solo propósito de generar tus respuestas y decidir qué ofertas te
        sirven.
      </p>
      <p>
        <strong>Decidir a qué ofertas postular no usa IA oferta por oferta</strong>: lo hace la
        extensión en tu navegador, comparando cada aviso con tu perfil de búsqueda. Revisar ofertas
        no envía nada a Anthropic.
      </p>
      <p>
        <strong>Aparte de eso</strong>, y sin ningún dato tuyo asociado, enviamos títulos de
        ofertas publicadas por las empresas para clasificarlos por tipo de cargo (ver 2.5). Son
        textos públicos de los avisos, no información de usuarios.
      </p>
      <p>
        Puedes revisar las políticas de Anthropic en{" "}
        <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">
          anthropic.com/legal/privacy
        </a>
        .
      </p>
      <div className="nota">
        <p>
          Las respuestas las genera un modelo automático. Puedes activar el{" "}
          <strong>modo revisión</strong> en la extensión para leerlas y editarlas antes de que se
          envíen, o el <strong>modo solo observar</strong> para que la extensión revise ofertas sin
          postular a ninguna. Ver también la sección 5 de los{" "}
          <a href="/terminos">Términos y condiciones</a>.
        </p>
      </div>

      <h3>Decisiones automatizadas</h3>
      <p>
        Cuando activas la postulación, la extensión decide sola a qué ofertas postular en tu nombre.
        Esto es lo que la ley llama una decisión automatizada, y te contamos cómo funciona:
      </p>
      <ul>
        <li>
          <strong>La lógica.</strong> Cada oferta recibe un puntaje de 0 a 100 según cuánto se parece a
          tu perfil de búsqueda: el cargo y sus sinónimos, la comuna o región, la jornada, lo que
          pide (un título, una licencia o inglés que tu CV no menciona) y lo que dijiste que no
          quieres. No se usa IA oferta por oferta: lo calcula la extensión en tu navegador.
        </li>
        <li>
          <strong>Las consecuencias.</strong> Desde 65 puntos la extensión postula sola (el corte
          puede bajar hasta 55 si casi siempre apruebas las ofertas parecidas; lo puedes apagar en
          Filtros). Entre 46 y 64 la oferta queda en <em>Por decidir</em> para que elijas tú. Con 45
          o menos se descarta, y te mostramos por qué.
        </li>
        <li>
          <strong>Tus derechos frente a ellas.</strong> Puedes ver la razón de cada descarte y
          corregirlo, revisar las respuestas antes de que se envíen (modo revisión), dejar que la
          extensión solo mire sin postular, decidir tú en <em>Por decidir</em> o en el panel de
          revisión, y escribirnos para darnos tu punto de vista o pedir que revisemos una decisión.
        </li>
      </ul>

      <h2>5. Con quién compartimos tus datos</h2>
      <p>
        No vendemos ni cedemos tus datos. Los compartimos únicamente con los proveedores necesarios
        para que el servicio funcione:
      </p>
      <table>
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Para qué</th>
            <th>Qué recibe</th>
            <th>Dónde</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic</td>
            <td>Generar respuestas y analizar avisos</td>
            <td>CV, perfil, aviso de trabajo</td>
            <td>Estados Unidos</td>
          </tr>
          <tr>
            <td>Flow</td>
            <td>Procesar los pagos de los pases</td>
            <td>Identificación básica y datos de la transacción</td>
            <td>Chile</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>
              Enviar los correos de confirmación de cuenta y de recuperación de contraseña, y
              hacernos llegar los mensajes de soporte
            </td>
            <td>Tu correo electrónico y, si escribes a soporte, tu mensaje y sus adjuntos</td>
            <td>Estados Unidos</td>
          </tr>
          <tr>
            <td>Google</td>
            <td>
              Iniciar sesión con Google, si eliges esa opción, y alojar la casilla donde recibimos
              los mensajes de soporte
            </td>
            <td>Tu mensaje de soporte y sus adjuntos, si nos escribes</td>
            <td>Estados Unidos</td>
          </tr>
          <tr>
            <td>
              <strong>Vercel</strong>
            </td>
            <td>Alojar la aplicación y medir las visitas del sitio (ver 2.10)</td>
            <td>Datos técnicos de conexión y estadísticas de visitas sin cookies</td>
            <td>Estados Unidos</td>
          </tr>
          <tr>
            <td>
              <strong>Neon</strong>
            </td>
            <td>Almacenar la base de datos</td>
            <td>Los datos de la sección 2 que guardamos en nuestra base de datos</td>
            <td>Brasil (São Paulo)</td>
          </tr>
        </tbody>
      </table>
      <p>
        El dictado por voz no pasa por ninguno de estos proveedores: lo procesa directamente tu
        navegador (ver 2.3).
      </p>
      <p>
        Estos proveedores tratan tus datos por encargo nuestro: solo pueden usarlos para prestarnos
        su servicio, no para fines propios.
      </p>
      <p>
        <strong>Transferencias fuera de Chile.</strong> Como muestra la tabla, salvo Flow, estos
        proveedores tratan los datos en Estados Unidos o en Brasil. Mientras la Agencia de
        Protección de Datos Personales no publique qué países ofrecen un nivel adecuado de
        protección, estas transferencias se amparan en los acuerdos de tratamiento de datos que
        tenemos con cada proveedor, que incluyen cláusulas contractuales de protección de datos.
      </p>
      <p>
        También podemos entregar datos si una autoridad competente nos lo exige mediante una orden
        legalmente válida.
      </p>

      <h2>6. La extensión de Chrome</h2>
      <p>La extensión de AutoPostula:</p>
      <ul>
        <li>
          <strong>Solo se ejecuta</strong> en páginas de Computrabajo, Laborum, Trabajando.com y el
          propio sitio de AutoPostula. En cualquier otro sitio no se carga ni ejecuta nada.
        </li>
        <li>
          <strong>Guarda en tu navegador</strong> tu configuración de búsqueda, el texto de tu CV,
          un registro de su actividad reciente y un token que identifica tu cuenta. El token se
          guarda en el almacenamiento sincronizado de Chrome: si tienes activada la sincronización,
          Chrome lo copia a tus otros dispositivos con tu misma cuenta de Google.
        </li>
        <li>
          <strong>Lee</strong> el contenido de los avisos de trabajo y de los formularios de
          postulación para poder completarlos.
        </li>
        <li>
          <strong>Mira la dirección de tus pestañas</strong> solo para saber si están en un portal
          compatible. No la guarda ni la envía.
        </li>
        <li>
          <strong>Envía</strong> a nuestros servidores el registro de las postulaciones realizadas,
          de las ofertas revisadas (ver 2.5) y de las que quedan esperando tu decisión, con su
          detalle (ver 2.6).
        </li>
      </ul>
      <p>
        La extensión solo se puede conectar a tu cuenta después de que confirmes tu correo
        electrónico.
      </p>
      <h3>Puesta al día automática</h3>
      <p>
        Si tu plan la incluye (Premium, o la prueba de 5 postulaciones automáticas del plan
        gratuito) y no la pausaste, la extensión se pone al día sola, en tandas: cuando abres
        Chrome, cuando el computador despierta, en una revisión periódica mientras Chrome está
        abierto, cuando activas la postulación desde tu panel y cuando aprietas &ldquo;Ponerme al
        día ahora&rdquo; (solo Premium). Sin que lo pidas tú, no hace más de una tanda cada unas
        3 horas.
      </p>
      <p>
        En cada tanda la extensión abre pestañas en segundo plano, <strong>de a una</strong>, con
        los resultados de búsqueda de los portales que conectaste (y, en Computrabajo, la página de
        &ldquo;Mis postulaciones&rdquo; para actualizar el estado de las que ya enviaste), revisa
        las ofertas nuevas, postula a las que calzan con tu perfil de búsqueda y cierra cada
        pestaña sola. Antes de buscar, envía las ofertas que aprobaste y estaban esperando (ver más
        abajo).
      </p>
      <p>
        <strong>
          Mientras dura una tanda, la extensión evita que tu computador se suspenda por
          inactividad
        </strong>
        , con un tope de 25 minutos, y lo libera apenas termina. No impide que la pantalla se
        apague ni que el computador se suspenda si cierras la tapa o lo apagas tú.
      </p>
      <p>
        Puedes pausarla en cualquier momento desde el panel de la extensión o desde tu cuenta. En
        el plan gratuito, fuera de esa prueba, la extensión no busca ofertas por sí sola: actúa
        cuando entras tú a un portal, o cuando apruebas una oferta que quedó esperando tu decisión.
      </p>
      <h3>Recordatorios por correo</h3>
      <p>
        Si tienes Premium y la extensión lleva 48 horas o más sin ponerse al día, te podemos
        mandar un correo para recordártelo: uno cada 72 horas como máximo, y ninguno pasados 14
        días. Para eso guardamos cuándo terminó la última puesta al día y cuándo conectaste la
        extensión. Cada correo trae un enlace para dejar de recibirlos, que funciona sin iniciar
        sesión.
      </p>
      <h3>Ofertas que quedan esperando tu decisión</h3>
      <p>
        Cuando una oferta no calza claramente con tu perfil ni queda claramente fuera, la
        extensión <strong>no postula</strong>. Primero abre el aviso en una pestaña en segundo
        plano para leer su detalle; si con eso queda claro, lo resuelve. Si sigue sin estar claro,
        la deja en una lista en tu cuenta para que tú decidas. Si la apruebas, la extensión abre
        esa oferta específica y postula por ti. Si no la revisas, vence sola a los{" "}
        <strong>7 días</strong>.
      </p>
      <h3>Modo solo observar</h3>
      <p>
        Si activas el modo solo observar, la extensión revisa y clasifica las ofertas igual que
        siempre, pero <strong>no postula a ninguna ni genera respuestas</strong>. Sirve para ver qué
        haría antes de dejarla actuar. Las ofertas a las que habría postulado quedan en tu cuenta
        para mostrártelas, y se eliminan a los 90 días.
      </p>

      <h2>7. Por cuánto tiempo conservamos tus datos</h2>
      <ul>
        <li>
          <strong>Mientras tu cuenta esté activa</strong>, conservamos todos los datos descritos.
        </li>
        <li>
          <strong>Las ofertas revisadas a las que nunca postulaste</strong> y sobre las que no
          tomaste una decisión (ver 2.5) se eliminan a los <strong>90 días</strong>.
        </li>
        <li>
          <strong>El registro de cada puesta al día automática</strong> (ver 2.4) se elimina a los{" "}
          <strong>90 días</strong>.
        </li>
        <li>
          <strong>Las ofertas que AutoPostula descartó por ti</strong>, con su razón (ver 2.5), se
          eliminan a los <strong>90 días</strong>.
        </li>
        <li>
          <strong>Las ofertas a las que la extensión habría postulado en modo solo observar</strong>{" "}
          (ver 6) se eliminan a los <strong>90 días</strong>.
        </li>
        <li>
          <strong>El registro de tus consentimientos</strong> (ver 2.1) se conserva mientras tu
          cuenta esté activa, incluso los que retiraste: hay que poder mostrar qué autorizaste y
          cuándo dejaste de hacerlo.
        </li>
        <li>
          <strong>Tus solicitudes para ejercer derechos</strong> (ver 9), con nuestra respuesta, se
          conservan <strong>aunque elimines tu cuenta</strong>: la ley nos pide guardar el respaldo de
          cada respuesta. De ellas queda solo tu correo, lo que pediste y lo que te respondimos.
        </li>
        <li>
          <strong>Las ofertas que quedan esperando tu decisión</strong> vencen a los 7 días si no
          las revisas. Dejan de estar pendientes, pero el registro de que vencieron se conserva
          mientras tu cuenta esté activa, porque es parte de lo que el sistema aprende de tus
          preferencias.
        </li>
        <li>
          <strong>Si eliminas tu cuenta</strong>, borramos tus datos personales de inmediato: el
          borrado es en cascada y arrastra tu perfil, tu CV, tus postulaciones, tus respuestas, tus
          preferencias y tus decisiones sobre ofertas.
        </li>
        <li>
          <strong>Lo que la extensión guarda en tu navegador</strong> (ver 6) no está en nuestros
          servidores, así que eliminar tu cuenta no lo borra: se elimina al desinstalar la
          extensión.
        </li>
        <li>
          <strong>Los mensajes de soporte</strong> (ver 2.8) están en nuestra casilla de correo, no
          en la base de datos, así que eliminar tu cuenta tampoco los borra. Si quieres que los
          eliminemos, pídenoslo.
        </li>
        <li>
          <strong>El diccionario de cargos</strong> (ver 2.5) se conserva, porque no contiene
          datos personales: son títulos de avisos públicos sin ninguna asociación a personas.
        </li>
        <li>
          <strong>Los registros de pago</strong> se conservan por el plazo que exija la normativa
          tributaria y contable chilena, aunque hayas eliminado tu cuenta.
        </li>
      </ul>

      <h2>8. Seguridad</h2>
      <ul>
        <li>Las contraseñas se guardan como hash con bcrypt, nunca en texto plano.</li>
        <li>
          El token que conecta la extensión con tu cuenta y los de los enlaces de los correos
          también se guardan solo como hash: quien leyera nuestra base de datos no podría usarlos.
        </li>
        <li>Todo el tráfico entre tu navegador y nuestros servidores viaja cifrado (HTTPS).</li>
        <li>El acceso a la base de datos está restringido y protegido por credenciales.</li>
        <li>
          Los enlaces para confirmar tu correo vencen a las 24 horas y los de recuperación de
          contraseña a la hora. Ambos dejan de servir apenas se usan.
        </li>
        <li>
          Limitamos los intentos de inicio de sesión, de registro y de recuperación de contraseña.
          Para eso guardamos una huella cifrada de la conexión, no tu dirección IP.
        </li>
        <li>Cada cuenta solo puede ver y cambiar sus propios datos.</li>
      </ul>
      <p>
        Ningún sistema es completamente invulnerable. Si un incidente de seguridad pone en riesgo
        tus datos personales, lo informaremos sin demora a la Agencia de Protección de Datos
        Personales y, cuando la ley lo exige (por ejemplo, si afecta datos sensibles o
        financieros), también a ti, en palabras claras y diciendo qué se vio afectado y qué hicimos.
      </p>

      <h2>9. Tus derechos</h2>
      <p>Sobre tus datos personales tienes derecho a:</p>
      <ul>
        <li>
          <strong>Acceso:</strong> saber qué datos tenemos sobre ti y cómo los usamos.
        </li>
        <li>
          <strong>Rectificación:</strong> corregir los que estén incorrectos o desactualizados.
        </li>
        <li>
          <strong>Supresión:</strong> que los borremos, incluida tu cuenta.
        </li>
        <li>
          <strong>Oposición:</strong> oponerte a que usemos tus datos para algo en particular, por
          ejemplo lo que hacemos por interés legítimo (ver 3).
        </li>
        <li>
          <strong>Portabilidad:</strong> recibir una copia de tus datos en un formato que otros
          sistemas puedan leer.
        </li>
        <li>
          <strong>Bloqueo:</strong> pedir que suspendamos temporalmente el uso de tus datos mientras
          resolvemos una solicitud tuya de rectificación, supresión u oposición.
        </li>
        <li>
          <strong>No quedar sujeto a decisiones solo automatizadas</strong> sin poder pedir una
          explicación, una revisión humana y dar tu punto de vista (ver 4).
        </li>
        <li>
          <strong>Retirar tu consentimiento</strong> cuando quieras, sin tener que dar razones. No
          afecta lo que hicimos antes de que lo retiraras.
        </li>
      </ul>

      <h3>Cómo ejercerlos</h3>
      <p>Mucho lo puedes hacer tú mismo desde tu panel, al instante:</p>
      <ul>
        <li>
          <strong>Ver y corregir</strong> tus datos: en Perfil.
        </li>
        <li>
          <strong>Descargar una copia de todo</strong> en un archivo JSON: en Ajustes → Tus datos →
          Descargar mis datos.
        </li>
        <li>
          <strong>Retirar la autorización de datos sensibles de tu CV</strong>: en Perfil, debajo de
          tu CV. Al hacerlo borramos tu CV.
        </li>
        <li>
          <strong>Eliminar tu cuenta</strong>: en Ajustes → Zona de peligro → Eliminar mi cuenta. El
          borrado es inmediato: se elimina tu CV, tu perfil, tu historial de postulaciones, tus
          preferencias y tu pase Premium (si tienes uno vigente, se da por terminado).
        </li>
        <li>
          <strong>Dejar de recibir recordatorios</strong>: con el enlace que trae cada correo.
        </li>
      </ul>
      <p>
        Para todo lo demás, pídelo en <strong>Ajustes → Tus datos → Ejercer un derecho</strong>: eliges
        el derecho, nos cuentas qué necesitas y ahí mismo ves el estado de tu solicitud y nuestra
        respuesta. Si no puedes entrar a tu cuenta, escríbenos a{" "}
        <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a> desde el correo con el que
        te registraste, diciendo qué derecho quieres ejercer y sobre qué datos. Es gratis. Te confirmamos que la recibimos y te respondemos por escrito{" "}
        <strong>dentro de 30 días corridos</strong>; si necesitamos más tiempo, te avisamos y el plazo
        se puede extender una sola vez por otros 30 días.
      </p>
      <div className="nota">
        <p>
          <strong>Si no respondemos a tiempo o rechazamos tu solicitud</strong>, te diremos por qué y
          podrás reclamar ante la <strong>Agencia de Protección de Datos Personales</strong> dentro de
          los 30 días hábiles siguientes.
        </p>
      </div>

      <h2>10. Cookies</h2>
      <p>
        Usamos únicamente las cookies necesarias para mantener tu sesión iniciada. No usamos
        cookies de publicidad ni de seguimiento de terceros. Las estadísticas del sitio (ver 2.10)
        no usan cookies. Si borras estas cookies, se cerrará tu sesión.
      </p>

      <h2>11. Menores de edad</h2>
      <p>
        AutoPostula está dirigido a personas mayores de 18 años, y al crear tu cuenta declaras
        tener esa edad. No recolectamos deliberadamente datos de menores de edad. Si detectamos una
        cuenta de un menor, la eliminaremos.
      </p>

      <h2>12. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta política. Si el cambio es relevante, te avisaremos por correo o
        mediante un aviso visible en la aplicación antes de que entre en vigencia, y te pediremos
        que aceptes la versión nueva la próxima vez que entres a tu panel. La fecha y la versión
        aparecen al comienzo de esta página.
      </p>

      <h2>13. Contacto</h2>
      <p>
        Para ejercer tus derechos o hacer cualquier consulta sobre esta política, escríbenos a{" "}
        <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
