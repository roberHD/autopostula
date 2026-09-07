import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Política de privacidad — AutoPostula",
  description:
    "Qué datos personales recolecta AutoPostula, para qué los usa, con quién los comparte y cómo ejercer tus derechos.",
};

export default function PrivacidadPage() {
  return (
    <LegalPage titulo="Política de privacidad" actualizado="4 de septiembre de 2026">
      <p>
        Esta política explica qué datos personales recolecta AutoPostula, con qué finalidad los
        usa, con quién los comparte y cómo puedes ejercer tus derechos sobre ellos. Aplica al
        sitio web, al panel de usuario y a la extensión de Chrome.
      </p>

      <h2>1. Quién es responsable de tus datos</h2>
      <p>
        El responsable del tratamiento de tus datos personales es{" "}
        <strong>Roberto Andrés Hidalgo Bizama</strong>, RUT{" "}
        <strong>21.723.850-1</strong>, domiciliado en <strong>Las Condes, Chile</strong>,
        en adelante &ldquo;AutoPostula&rdquo;.
      </p>
      <p>
        Para cualquier consulta sobre esta política o sobre tus datos, escríbenos a{" "}
        <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a>.
      </p>

      <h2>2. Qué datos recolectamos</h2>

      <h3>2.1 Datos de tu cuenta</h3>
      <ul>
        <li>Correo electrónico y nombre.</li>
        <li>
          Contraseña, almacenada siempre como <strong>hash</strong> (bcrypt). Nunca guardamos ni
          podemos ver tu contraseña en texto plano.
        </li>
        <li>Fecha de creación de la cuenta.</li>
      </ul>

      <h3>2.2 Datos de tu perfil profesional</h3>
      <p>
        Cuando subes tu currículum, extraemos su texto y lo guardamos junto con los datos que
        completas en tu perfil:
      </p>
      <ul>
        <li>Nombre, correo, teléfono y comuna.</li>
        <li>RUT.</li>
        <li>Cargo objetivo, expectativa de renta, disponibilidad y modalidad de trabajo.</li>
        <li>Resumen profesional, experiencia laboral y habilidades.</li>
        <li>El texto completo extraído de tu CV y el nombre del archivo original.</li>
      </ul>
      <div className="nota">
        <p>
          <strong>No almacenamos el archivo PDF de tu CV.</strong> Al subirlo extraemos su texto y
          descartamos el archivo; solo conservamos ese texto y el nombre del archivo.
        </p>
      </div>

      <h3>2.3 Datos de tu perfil de estilo</h3>
      <p>
        Si usas la conversación con la IA para definir tu estilo de respuesta, guardamos tu
        objetivo laboral, motivaciones, fortalezas y las preferencias de tono y longitud que
        resulten de esa conversación. Según tu plan, también podemos conservar el historial de esa
        conversación para que puedas retomarla.
      </p>

      <h3>2.4 Datos de tus postulaciones</h3>
      <ul>
        <li>Ofertas a las que postulaste: título, empresa, enlace y portal.</li>
        <li>Las respuestas que se enviaron en cada formulario.</li>
        <li>Estado de cada postulación y su historial de cambios.</li>
        <li>Registro de las llamadas a la IA realizadas, para controlar los límites de tu plan.</li>
      </ul>

      <h3>2.5 Ofertas que la extensión revisa</h3>
      <p>
        Para poder decidir a qué postular, la extensión revisa las ofertas que aparecen en los
        resultados de búsqueda de los portales. De cada una guardamos el título, la empresa, el
        enlace y el portal, <strong>aunque no postules a ella</strong>.
      </p>
      <p>Esa información se usa para dos cosas:</p>
      <ul>
        <li>
          <strong>No mostrarte ni postular dos veces a la misma oferta.</strong>
        </li>
        <li>
          <strong>Mejorar el reconocimiento de cargos.</strong> Los títulos de las ofertas —sin
          ningún dato tuyo asociado— alimentan un diccionario compartido que nos permite entender
          que, por ejemplo, &ldquo;asesor comercial&rdquo; y &ldquo;vendedor&rdquo; son lo mismo.
          Ese diccionario contiene solo nombres de cargos publicados por las empresas en avisos
          públicos, nunca información de usuarios.
        </li>
      </ul>
      <div className="nota">
        <p>
          Las ofertas revisadas a las que <strong>nunca postulaste</strong> se eliminan
          automáticamente a los <strong>90 días</strong>.
        </p>
      </div>

      <h3>2.6 Tus preferencias sobre qué ofertas te interesan</h3>
      <p>
        Cuando marcas si postularías o no a una oferta —en el paso de preferencias al crear tu
        cuenta, o en la lista de ofertas que quedan pendientes de tu decisión— guardamos esa
        respuesta junto con el título, la empresa y el enlace de la oferta.
      </p>
      <p>
        Con esas respuestas, más tu CV y lo que hayas conversado con la IA, armamos un{" "}
        <strong>perfil de búsqueda</strong>: una lista de los cargos que te interesan, los que
        quieres evitar y tus preferencias de comuna, jornada y modalidad. Ese perfil es lo que la
        extensión usa para decidir a qué postular, y se recalcula cuando cambias algo.
      </p>

      <h3>2.7 Datos de pago</h3>
      <p>
        Si contratas un plan de pago, guardamos un identificador de cliente de la pasarela de
        pagos, el monto, la fecha y el estado de cada cobro.
      </p>
      <div className="nota">
        <p>
          <strong>No recibimos, procesamos ni almacenamos los datos de tu tarjeta.</strong> Esa
          información la maneja directamente Flow, nuestra pasarela de pagos, en sus propios
          sistemas.
        </p>
      </div>

      <h3>2.8 Lo que NO recolectamos</h3>
      <ul>
        <li>
          <strong>No pedimos ni almacenamos las contraseñas de Computrabajo ni de Laborum.</strong>{" "}
          La extensión trabaja sobre la sesión que tú ya iniciaste en esos portales desde tu propio
          navegador.
        </li>
        <li>No leemos tu historial de navegación ni las pestañas que tengas abiertas.</li>
        <li>
          No accedemos a ningún sitio web fuera de Computrabajo, Laborum y el propio sitio de
          AutoPostula.
        </li>
        <li>No vendemos tus datos a nadie, bajo ninguna circunstancia.</li>
      </ul>

      <h2>3. Para qué usamos tus datos</h2>
      <table>
        <thead>
          <tr>
            <th>Dato</th>
            <th>Finalidad</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Correo y contraseña</td>
            <td>Autenticarte y permitirte recuperar el acceso a tu cuenta.</td>
          </tr>
          <tr>
            <td>CV y perfil profesional</td>
            <td>Completar automáticamente los formularios de postulación y generar respuestas.</td>
          </tr>
          <tr>
            <td>Filtros y perfil de búsqueda</td>
            <td>Decidir a qué ofertas postular y cuáles descartar.</td>
          </tr>
          <tr>
            <td>Ofertas revisadas</td>
            <td>
              No repetir postulaciones y mejorar el reconocimiento de cargos.
            </td>
          </tr>
          <tr>
            <td>Tus preferencias sobre ofertas</td>
            <td>Aprender qué cargos te interesan y afinar el perfil de búsqueda.</td>
          </tr>
          <tr>
            <td>Perfil de estilo</td>
            <td>Ajustar el tono y la extensión de las respuestas generadas.</td>
          </tr>
          <tr>
            <td>Historial de postulaciones</td>
            <td>Mostrarte tu actividad y evitar postular dos veces a lo mismo.</td>
          </tr>
          <tr>
            <td>Registro de uso de IA</td>
            <td>Aplicar los límites mensuales de tu plan.</td>
          </tr>
          <tr>
            <td>Datos de pago</td>
            <td>Gestionar tu suscripción y emitir los cobros correspondientes.</td>
          </tr>
        </tbody>
      </table>

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
          envíen. Ver también la sección 5 de los{" "}
          <a href="/terminos">Términos y condiciones</a>.
        </p>
      </div>

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
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic</td>
            <td>Generar respuestas y analizar avisos</td>
            <td>CV, perfil, aviso de trabajo</td>
          </tr>
          <tr>
            <td>Flow</td>
            <td>Procesar pagos y suscripciones</td>
            <td>Identificación básica y datos de la transacción</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>Enviar correos de recuperación de contraseña</td>
            <td>Tu correo electrónico</td>
          </tr>
          <tr>
            <td>
              <strong>Vercel</strong>
            </td>
            <td>Alojar la aplicación</td>
            <td>Datos técnicos de conexión</td>
          </tr>
          <tr>
            <td>
              <strong>Neon</strong>
            </td>
            <td>Almacenar la base de datos</td>
            <td>Todos los datos descritos en la sección 2</td>
          </tr>
        </tbody>
      </table>
      <p>
        Algunos de estos proveedores procesan datos fuera de Chile. Al usar AutoPostula aceptas esa
        transferencia internacional, necesaria para prestar el servicio.
      </p>
      <p>
        También podemos entregar datos si una autoridad competente nos lo exige mediante una orden
        legalmente válida.
      </p>

      <h2>6. La extensión de Chrome</h2>
      <p>La extensión de AutoPostula:</p>
      <ul>
        <li>
          <strong>Solo se ejecuta</strong> en páginas de Computrabajo, Laborum y el propio sitio de
          AutoPostula. En cualquier otro sitio no se carga ni ejecuta nada.
        </li>
        <li>
          <strong>Guarda localmente</strong> en tu navegador: tus filtros de búsqueda, tu perfil y
          un token que identifica tu cuenta.
        </li>
        <li>
          <strong>Lee</strong> el contenido de los avisos de trabajo y de los formularios de
          postulación para poder completarlos.
        </li>
        <li>
          <strong>Envía</strong> a nuestros servidores el registro de las postulaciones realizadas
          y de las ofertas revisadas (ver 2.5).
        </li>
      </ul>
      <h3>Búsqueda automática</h3>
      <p>
        Si activas la búsqueda automática, la extensión abre cada dos horas una pestaña en segundo
        plano con los resultados de búsqueda de los portales que conectaste, revisa las ofertas
        nuevas, postula a las que calzan con tu perfil de búsqueda y cierra la pestaña sola.
        Puedes desactivarla en cualquier momento desde el panel de la extensión o desde tu cuenta.
      </p>
      <h3>Ofertas que quedan esperando tu decisión</h3>
      <p>
        Cuando una oferta no calza claramente con tu perfil ni queda claramente fuera, la
        extensión <strong>no postula</strong>: la deja en una lista en tu cuenta para que tú
        decidas. Si la apruebas, la extensión abre esa oferta específica en una pestaña en segundo
        plano y postula por ti. Si no la revisas, se descarta sola a los pocos días.
      </p>

      <h2>7. Por cuánto tiempo conservamos tus datos</h2>
      <ul>
        <li>
          <strong>Mientras tu cuenta esté activa</strong>, conservamos todos los datos descritos.
        </li>
        <li>
          <strong>Las ofertas revisadas a las que nunca postulaste</strong> (ver 2.5) se eliminan
          automáticamente a los <strong>90 días</strong>.
        </li>
        <li>
          <strong>Las ofertas que quedan esperando tu decisión</strong> vencen solas a los pocos
          días si no las revisas.
        </li>
        <li>
          <strong>Si eliminas tu cuenta</strong>, borramos tus datos personales de inmediato: el
          borrado es en cascada y arrastra tu perfil, tu CV, tus postulaciones, tus respuestas y
          tus preferencias.
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
        <li>Todo el tráfico entre tu navegador y nuestros servidores viaja cifrado (HTTPS).</li>
        <li>El acceso a la base de datos está restringido y protegido por credenciales.</li>
        <li>
          Los enlaces de recuperación de contraseña tienen una vigencia limitada y se invalidan al
          usarse.
        </li>
      </ul>
      <p>
        Ningún sistema es completamente invulnerable. Si detectamos un incidente de seguridad que
        afecte tus datos personales, te avisaremos.
      </p>

      <h2>9. Tus derechos</h2>
      <p>
        Conforme a la Ley N° 19.628 sobre protección de la vida privada, y a la Ley N° 21.719 una
        vez que entre en vigencia, tienes derecho a:
      </p>
      <ul>
        <li>
          <strong>Acceder</strong> a los datos personales que tenemos sobre ti.
        </li>
        <li>
          <strong>Rectificar</strong> los datos que estén incorrectos o desactualizados.
        </li>
        <li>
          <strong>Eliminar</strong> tus datos y tu cuenta.
        </li>
        <li>
          <strong>Oponerte</strong> a determinados tratamientos.
        </li>
        <li>
          <strong>Solicitar una copia</strong> de tus datos en un formato legible.
        </li>
      </ul>
      <p>
        Puedes editar la mayor parte de tus datos directamente desde tu panel, en la sección
        Perfil.
      </p>
      <div className="nota">
        <p>
          <strong>Para eliminar tu cuenta</strong>, entra a tu panel y ve a Ajustes → Zona de
          peligro → Eliminar mi cuenta. El borrado es inmediato: se elimina tu CV, tu perfil, tu
          historial de postulaciones, tus preferencias y tu suscripción (si tienes una activa, se
          cancela). Si no puedes acceder a tu cuenta, escríbenos a{" "}
          <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a> desde
          el correo con el que te registraste; en ese caso procesamos la solicitud dentro de los 30
          días siguientes y te confirmamos cuando esté hecho.
        </p>
      </div>

      <h2>10. Cookies</h2>
      <p>
        Usamos únicamente las cookies necesarias para mantener tu sesión iniciada. No usamos
        cookies de publicidad ni de seguimiento de terceros. Si borras estas cookies, se cerrará tu
        sesión.
      </p>

      <h2>11. Menores de edad</h2>
      <p>
        AutoPostula está dirigido a personas mayores de 18 años. No recolectamos deliberadamente
        datos de menores de edad. Si detectamos una cuenta de un menor, la eliminaremos.
      </p>

      <h2>12. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta política. Si el cambio es relevante, te avisaremos por correo o
        mediante un aviso visible en la aplicación antes de que entre en vigencia. La fecha de la
        última actualización aparece al comienzo de esta página.
      </p>

      <h2>13. Contacto</h2>
      <p>
        Para ejercer tus derechos o hacer cualquier consulta sobre esta política, escríbenos a{" "}
        <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
