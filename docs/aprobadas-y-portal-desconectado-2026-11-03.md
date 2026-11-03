# Aprobadas en un portal desconectado y tarjetas repetidas — 2026-11-03

> **Estado:** implementado en `rama-roberto`. Es del servidor y del panel: no toca la extensión.
> **Origen:** la cuenta de una usuaria nueva (`0fce36`) que busca trabajo de vendedora. Aprobó 24
> veces ofertas de vendedor en Trabajando y no salió ninguna. Se revisó con consultas de solo lectura
> en la consola de Neon.
> **Relacionado:** `revision-2026-09-28.md` §6 (aprobadas atascadas), `panel-de-revision-en-el-portal.md`,
> `rediseno-filtrado-ofertas.md` §8 («Por decidir»).

---

## 0. Lo esencial

1. **El plan gratis usa un portal a la vez.** Ella se cambió de Trabajando a Laborum, y desde ahí
   nada de lo aprobado en Trabajando se podía enviar: `/api/extension/puede-postular` responde
   «portal» y la extensión se saltaba esas ofertas sin decir nada.
2. **Esas aprobadas además tapaban a las demás.** El servidor le entrega a la extensión las 5
   aprobadas más recientes, y las 5 eran de Trabajando. Si una de Laborum fallaba una vez, no se
   volvía a intentar.
3. **«Por decidir» repetía ofertas ya decididas.** Solo evitaba repetir las que seguían pendientes:
   una oferta aprobada volvía con el escaneo siguiente. Ella aprobó una docena de ofertas dos veces,
   y en la base había 36 tarjetas así, de 5 personas.
4. **El arreglo:**
   - la extensión solo recibe aprobadas de portales conectados;
   - «Por decidir» y Portales dicen cuántas esperan en un portal desconectado;
   - una oferta ya decidida no vuelve a «Por decidir».

## 1. Lo que mostró la base

| Hora (Chile, 02 al 03-11) | Qué pasó |
|---|---|
| 23:36 | Conecta Trabajando |
| 23:45–00:10 | Aprueba ofertas de vendedor en «Por decidir». Sacaban 50 puntos porque ventas era su segundo objetivo, con peso 0,5. La extensión intenta enviarlas (7 veces contesta preguntas con la IA) y no sale ninguna: Trabajando no dejaba escribir en la ventana de AutoPostula, lo arregla la 2.21.0 del otro chat |
| 00:12 | Se cambia a Laborum, y Trabajando queda desconectado |
| 00:15–04:27 | 9 postulaciones en Laborum, todas de vendedor |
| 04:22 | Aprueba 3 más de Trabajando, que tampoco iban a salir |

Al revisarla quedaban 24 aprobadas de Trabajando sin enviar, y las 5 que el servidor le pasaba a la
extensión eran de Trabajando. Era la única cuenta con aprobadas atascadas por un portal
desconectado.

## 2. Aprobadas de un portal desconectado

- **`lib/aprobadas-por-enviar.ts`** (nuevo) junta la regla en un solo lugar:
  - `filtroAprobadasPorEnviar`: un «sí» sin postulación, con enlace y portal, de menos de 14 días;
  - `portalesConectados`;
  - `esperandoEnPortalesDesconectados`: por cada portal desconectado, cuántas aprobadas y cuántas
    tarjetas de «Por decidir» esperan.
- **`/api/extension/perfil`:** entrega solo las aprobadas de portales conectados, y una oferta
  aprobada dos veces ocupa un cupo. No se borra ni se marca nada: si vuelve a conectar ese portal
  antes de 14 días, salen.
- **El recordatorio por correo** («Tienes N ofertas que aprobaste esperando para enviarse») cuenta
  con la misma regla, porque las de un portal desconectado no salen al abrir Chrome.
- **«Por decidir»:**
  - arriba, un aviso por cada portal desconectado con algo esperando: «Trabajando está
    desconectado. Tienes 4 ofertas aprobadas de Trabajando que no se van a enviar mientras siga
    así…», con el enlace a Portales;
  - en cada tarjeta de ese portal: «Trabajando está desconectado: si dices que sí, se envía cuando
    lo vuelvas a conectar». Esas tarjetas no muestran el pie «se envía en cuanto tu computador tenga
    Chrome abierto»;
  - al aprobar una de esas no se le avisa a la extensión, que contestaría «ya la tiene en cola».
- **Portales:**
  - la tarjeta de un portal desconectado dice cuántas aprobadas esperan;
  - al desconectar uno con aprobadas: «Desconectaste Trabajando. Las 4 ofertas que aprobaste de ahí
    quedan guardadas y se envían si lo vuelves a conectar dentro de 14 días.»

## 3. «Por decidir» no repite lo decidido

- **`/api/extension/banda-gris`:** antes solo miraba si había una pendiente con el mismo enlace.
  Ahora mira cualquier decisión de esa cuenta sobre esa oferta, en «Por decidir» o en el panel del
  portal: pendiente, sí, no, o un sí que la extensión no pudo enviar (EXPIRADA con fecha de
  decisión). Solo vuelve a preguntar si la anterior venció sin que nadie la decidiera.
- **La misma oferta con otro enlace** (`lib/misma-oferta.ts`, nuevo):
  - Trabajando agrega lo que se buscó (`/trabajo-empleo/vendedor/trabajo/6141491-…`);
  - Computrabajo la muestra suelta (`…-ID`) o en un listado (`trabajo-de-…#ID`);
  - el número del aviso es el mismo, y es el que usa cada adaptador de la extensión.

  Las 36 repetidas de la base tenían el mismo enlace. El número sirve para cuando la persona busca
  con otra palabra.

## 4. Cómo se verificó

- **`backend/scripts/verificar-aprobadas-portal.ts`** (nuevo, 34 comprobaciones contra una base de
  prueba): la clave de la oferta en los tres portales, lo que recibe la extensión, lo que no vuelve a
  «Por decidir» y lo que espera por portal.
- **`verificar-recordatorio-rafaga.ts`** suma dos aprobadas de un portal desconectado, que no
  cuentan. La cuenta de prueba ahora tiene su portal conectado.
- **Mutaciones:** deshaciendo cada parte (9 cambios), falla alguna comprobación.
- **En el navegador**, con una cuenta de prueba:
  - el aviso de arriba, la tarjeta, el mensaje al aprobar y el conteo, en escritorio y en celular;
  - en Portales, la nota del portal desconectado y el aviso al desconectar.
- La base de prueba es el PGlite en memoria, con un intermediario que reparte turnos entre las
  conexiones. Sin él, las consultas en paralelo de Next se cruzaban y Portales no cargaba.

## 5. Pendiente y fuera de esto

1. **Para que le llegue a ella:** mergear a `main`. Es del servidor, no espera a la tienda.
2. **La extensión sigue escaneando un portal desconectado** y llenando «Por decidir» con sus
   ofertas. Ahora cada tarjeta lo avisa. Dejar de escanearlo es un cambio de la extensión, que hoy
   está tocando el otro chat.
3. **El panel del portal (la lista para elegir) en un portal desconectado:** lo marcado queda
   aprobado y no sale, y la extensión muestra «no enviada». Podría avisarlo antes de marcar.
