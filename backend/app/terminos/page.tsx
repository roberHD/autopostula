import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Términos y condiciones — AutoPostula",
  description:
    "Condiciones de uso del servicio AutoPostula: cuenta, uso de portales de terceros, contenido generado por IA, planes, pagos y cancelación.",
};

export default function TerminosPage() {
  return (
    <LegalPage titulo="Términos y condiciones" actualizado="3 de septiembre de 2026">
      <p>
        Estos términos regulan el uso de AutoPostula: el sitio web, el panel de usuario y la
        extensión de Chrome. Al crear una cuenta o instalar la extensión, aceptas lo que sigue.
      </p>

      <h2>1. Quiénes somos</h2>
      <p>
        AutoPostula es un servicio operado por <strong>[COMPLETAR: nombre o razón social]</strong>,
        RUT <strong>[COMPLETAR]</strong>, domiciliado en{" "}
        <strong>[COMPLETAR: comuna, Chile]</strong>. Contacto:{" "}
        <a href="mailto:[COMPLETAR: correo de contacto]">[COMPLETAR: correo de contacto]</a>.
      </p>

      <h2>2. Qué es AutoPostula</h2>
      <p>
        AutoPostula es una herramienta que automatiza la postulación a ofertas de empleo en
        portales de trabajo chilenos. A partir de tu CV y tus filtros, busca ofertas, completa los
        formularios de postulación con ayuda de inteligencia artificial y los envía en tu nombre.
      </p>
      <p>
        AutoPostula <strong>no es una agencia de empleo, ni una bolsa de trabajo, ni un
        intermediario laboral</strong>. No publicamos ofertas, no seleccionamos candidatos y no
        tenemos relación con las empresas que publican los avisos.
      </p>

      <h2>3. Tu cuenta</h2>
      <ul>
        <li>Debes ser mayor de 18 años y entregar información veraz.</li>
        <li>
          Eres responsable de mantener la confidencialidad de tu contraseña y de toda la actividad
          que ocurra bajo tu cuenta.
        </li>
        <li>Una cuenta corresponde a una persona. No puedes compartirla ni transferirla.</li>
        <li>Debes avisarnos si detectas un uso no autorizado de tu cuenta.</li>
      </ul>

      <h2>4. Uso de portales de terceros</h2>
      <div className="nota">
        <p>
          <strong>
            AutoPostula no tiene relación, afiliación, patrocinio ni convenio alguno con
            Computrabajo, Laborum ni ningún otro portal de empleo.
          </strong>{" "}
          Los nombres y marcas de esos portales pertenecen a sus respectivos titulares y se
          mencionan solo para identificar dónde opera la herramienta.
        </p>
      </div>
      <p>Al usar AutoPostula reconoces y aceptas que:</p>
      <ul>
        <li>
          Las postulaciones se realizan <strong>desde tu propia cuenta</strong> en cada portal,
          usando la sesión que tú iniciaste en tu navegador. AutoPostula no crea cuentas por ti ni
          conoce tus contraseñas de esos portales.
        </li>
        <li>
          <strong>Eres tú quien debe cumplir los términos de uso de cada portal.</strong> Algunos
          portales restringen el uso de herramientas automatizadas. Revisa sus condiciones antes de
          usar AutoPostula sobre ellos.
        </li>
        <li>
          Un portal podría suspender o cerrar tu cuenta por el uso de herramientas de
          automatización. <strong>AutoPostula no responde por esa consecuencia</strong>, ni puede
          revertirla.
        </li>
        <li>
          Los portales pueden cambiar su sitio en cualquier momento y dejar la herramienta
          temporalmente inoperativa.
        </li>
      </ul>

      <h2>5. Contenido generado por inteligencia artificial</h2>
      <p>
        Las respuestas de los formularios las genera un modelo de lenguaje automático a partir de
        tu CV y tu perfil. Esto implica que:
      </p>
      <ul>
        <li>
          <strong>Las respuestas se envían en tu nombre y bajo tu responsabilidad.</strong> Ante la
          empresa que recibe la postulación, eres tú quien respondió.
        </li>
        <li>
          El modelo puede cometer errores, imprecisiones o generar contenido que no represente
          fielmente tu experiencia.
        </li>
        <li>
          Puedes activar el <strong>modo revisión</strong> para leer y editar cada respuesta antes
          de que se envíe. Te recomendamos usarlo, sobre todo al principio.
        </li>
        <li>
          <strong>Eres responsable de la veracidad de la información de tu CV y tu perfil</strong>,
          que es la base de todo lo que se genera.
        </li>
      </ul>

      <h2>6. Planes y pagos</h2>
      <h3>6.1 Plan gratuito</h3>
      <p>
        Existe un plan gratuito con límites mensuales de postulaciones, de portales conectados
        simultáneamente y de uso de la IA. Los límites vigentes se muestran en tu cuenta.
      </p>

      <h3>6.2 Plan de pago</h3>
      <p>
        El plan Premium tiene un valor de <strong>$3.990 CLP mensuales</strong>, impuestos
        incluidos, y se cobra mediante <strong>suscripción de renovación automática</strong>.
      </p>
      <ul>
        <li>Los pagos se procesan a través de Flow, pasarela de pagos chilena.</li>
        <li>
          AutoPostula no recibe ni almacena los datos de tu tarjeta; los administra directamente
          Flow.
        </li>
        <li>
          La suscripción se renueva automáticamente cada mes hasta que la canceles, con cargo al
          medio de pago que registraste.
        </li>
        <li>
          Si un cobro falla, podemos suspender el acceso a las funciones de pago hasta
          regularizarlo.
        </li>
      </ul>

      <h3>6.3 Cambios de precio</h3>
      <p>
        Podemos modificar el precio del plan. Si eso ocurre, te avisaremos con al menos 30 días de
        anticipación y el nuevo valor solo se aplicará en el período siguiente. Si no estás de
        acuerdo, puedes cancelar antes de que entre en vigencia.
      </p>

      <h2>7. Cancelación</h2>
      <p>
        Puedes cancelar tu suscripción cuando quieras desde tu cuenta, en la sección Premium. La
        cancelación opera <strong>al final del período ya pagado</strong>: conservas el acceso
        Premium hasta esa fecha y no se realizan cobros posteriores.
      </p>
      <p>
        No hay penalizaciones ni plazos mínimos de permanencia. Al terminar el período, tu cuenta
        vuelve automáticamente al plan gratuito, sin que pierdas tu historial ni tu perfil.
      </p>
      <div className="nota">
        <p>
          <strong>[REVISAR CON ABOGADO]</strong> — El derecho a retracto del artículo 3° bis de la
          Ley N° 19.496 sobre protección de los derechos de los consumidores puede aplicar a esta
          contratación. Define y declara aquí expresamente tu política de retracto y reembolsos
          antes de publicar.
        </p>
      </div>

      <h2>8. Uso aceptable</h2>
      <p>No puedes usar AutoPostula para:</p>
      <ul>
        <li>Postular con información falsa, suplantando a otra persona o usando un CV ajeno.</li>
        <li>Revender, sublicenciar o redistribuir el servicio.</li>
        <li>
          Intentar vulnerar, descompilar o eludir los límites técnicos del servicio o de los
          portales.
        </li>
        <li>Automatizar el uso del servicio mediante scripts o herramientas ajenas.</li>
        <li>Crear múltiples cuentas para eludir los límites del plan gratuito.</li>
        <li>Cualquier finalidad ilícita o contraria a la buena fe.</li>
      </ul>
      <p>
        Podemos suspender o cerrar cuentas que incumplan lo anterior, sin derecho a reembolso de
        períodos en curso cuando el incumplimiento sea grave.
      </p>

      <h2>9. Disponibilidad del servicio</h2>
      <p>
        Hacemos nuestro mejor esfuerzo por mantener el servicio operativo, pero{" "}
        <strong>no garantizamos disponibilidad ininterrumpida</strong>. El servicio puede
        interrumpirse por mantenciones, fallas técnicas, problemas de proveedores externos o
        cambios en los portales de empleo.
      </p>
      <p>
        Podemos modificar, suspender o descontinuar funcionalidades. Si descontinuamos el servicio
        por completo, avisaremos con al menos 30 días de anticipación y no cobraremos períodos
        posteriores.
      </p>

      <h2>10. Sin garantía de resultados</h2>
      <div className="nota">
        <p>
          <strong>
            AutoPostula no garantiza que consigas trabajo, que recibas respuestas, ni que tus
            postulaciones sean recibidas, leídas o consideradas por las empresas.
          </strong>{" "}
          La herramienta automatiza el envío de postulaciones; el resultado depende de las
          empresas, de los portales y de tu perfil.
        </p>
      </div>

      <h2>11. Limitación de responsabilidad</h2>
      <p>
        En la medida en que lo permita la ley chilena, AutoPostula no responde por:
      </p>
      <ul>
        <li>Oportunidades laborales perdidas o no obtenidas.</li>
        <li>
          Suspensión o cierre de tu cuenta en portales de empleo de terceros por el uso de
          herramientas de automatización.
        </li>
        <li>Errores en el contenido generado por la inteligencia artificial.</li>
        <li>Postulaciones enviadas a ofertas que no querías, por una configuración incorrecta de tus filtros.</li>
        <li>Interrupciones del servicio o cambios en los portales de empleo.</li>
      </ul>
      <p>
        En cualquier caso, y salvo dolo o culpa grave de nuestra parte, nuestra responsabilidad
        total se limita al monto que hayas pagado por el servicio en los últimos 3 meses.
      </p>
      <p>
        Nada de lo anterior limita los derechos que te reconoce la Ley N° 19.496 sobre protección
        de los derechos de los consumidores.
      </p>

      <h2>12. Propiedad intelectual</h2>
      <p>
        El software, la marca y el contenido de AutoPostula nos pertenecen. Al contratar el
        servicio recibes una licencia de uso personal, limitada, no exclusiva y revocable.
      </p>
      <p>
        <strong>Tu CV, tu perfil y tus datos siguen siendo tuyos.</strong> Los usamos únicamente
        para prestarte el servicio, según lo descrito en la{" "}
        <a href="/privacidad">Política de privacidad</a>.
      </p>

      <h2>13. Término de la relación</h2>
      <p>
        Puedes dejar de usar el servicio y solicitar la eliminación de tu cuenta en cualquier
        momento (ver la <a href="/privacidad">Política de privacidad</a>, sección 9).
      </p>
      <p>
        Podemos cerrar tu cuenta si incumples estos términos, si la usas de forma fraudulenta o si
        la ley nos obliga. Salvo incumplimiento grave, te avisaremos antes y devolveremos la parte
        proporcional del período pagado no utilizado.
      </p>

      <h2>14. Cambios a estos términos</h2>
      <p>
        Podemos actualizar estos términos. Si el cambio es relevante, te avisaremos por correo o
        con un aviso visible en la aplicación con al menos 15 días de anticipación. Si sigues
        usando el servicio después de esa fecha, se entiende que aceptas la nueva versión.
      </p>

      <h2>15. Ley aplicable y jurisdicción</h2>
      <p>
        Estos términos se rigen por la ley chilena. Cualquier controversia se someterá a los
        tribunales ordinarios de justicia de{" "}
        <strong>[COMPLETAR: comuna/ciudad]</strong>, sin perjuicio de los derechos que la Ley N°
        19.496 reconoce a los consumidores, incluida la posibilidad de recurrir al SERNAC.
      </p>

      <h2>16. Contacto</h2>
      <p>
        Para cualquier consulta sobre estos términos, escríbenos a{" "}
        <a href="mailto:[COMPLETAR: correo de contacto]">[COMPLETAR: correo de contacto]</a>.
      </p>
    </LegalPage>
  );
}
