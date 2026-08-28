# Flujos entre PopCar y el ERP

Qué pasa cuando un cliente hace algo en PopCar, dónde se ve en el ERP, qué tiene
que ejecutar un trabajador y qué ocurre cuando lo ejecuta.

Cada flujo se documenta leyendo el código. Las referencias son a fichero y
**nombre de función**, no a número de línea: los números se mueven en cuanto
alguien toca algo encima, y una referencia que apunta a otro sitio es peor que
ninguna. Ya pasó una vez aquí.

Si algo aquí no coincide con lo que hace el sistema, manda el código: lo que hay
que corregir es este documento.

---

## 1. Visita a una oferta de concesionario desde el marketplace VO

### Lo que hace el cliente

Entra en el marketplace VO, abre una oferta de concesionario y pulsa **Solicitar
visita**. Se le abre un calendario, elige día y hora, rellena nombre, teléfono y
notas, y confirma.

### Por dónde pasa

| Paso | Dónde |
|---|---|
| Botón y calendario | `src/pages/PortalVoDetailPage.js` → `src/components/SlotPicker.js` |
| Pedir horarios libres | `GET /api/visit-availability?offerId=…` → `getSlots` |
| Confirmar la reserva | `POST /api/visit-availability` con `route: "book"` |
| Lo que la ejecuta | `lib/api/visit-availability-handler.js` → `bookSlot` |

La reserva se hace **dentro de una transacción**, con `SELECT … FOR UPDATE` sobre
el hueco. Dos personas que pulsen a la vez no pueden reservar la misma hora: la
segunda recibe `slot_unavailable` y el calendario le quita ese hueco de la
pantalla.

El **correo del vendedor lo resuelve el servidor** leyéndolo de la oferta, no
llega del navegador. Antes venía de fuera, y eso permitía que cualquiera se
hiciera mandar la visita de otro.

### Qué queda escrito

Dos tablas, ninguna de ellas la de leads:

- `vehicle_visit_availability` — el hueco pasa de `available` a `booked`.
- `vehicle_visit_bookings` — fila nueva y dos testigos (`token_buyer`,
  `token_seller`) que permiten cancelar o cambiar la cita desde el enlace del
  correo, sin contraseña.

**Siempre nace `pending`.** Ninguna visita se da por confirmada sola: alguien
tiene que llamar al concesionario y aprobarla desde la Agenda. De dónde salió el
hueco se guarda igual, y el ERP lo enseña, pero no cambia el estado.

### Dónde sigue el cliente su cita

**No en el panel.** «Solicitudes» del panel lee `/api/leads`, y una reserva del
marketplace no es un lead: vive en otra tabla. Ahí no aparece, ni pendiente ni
confirmada.

La sigue desde el **enlace de su correo**, `/mi-cita?id=…&token=…`. Esa página es
la suya: no pide contraseña —el testigo hace de llave— y desde ahí puede ver el
estado, cambiar la hora o anular. El estado se ve como **Pendiente de confirmar**,
**✓ Confirmada** o **Cancelada**.

Si un cliente pregunta «no veo mi cita en mi cuenta», la respuesta es esa: está
en el enlace del correo. Es consecuencia de los dos sistemas en paralelo, y
mientras sigan separados no va a aparecer en el panel.

### Qué ve el cliente al terminar

Si la reserva quedó **confirmada**, la pantalla dice «¡Visita confirmada!» y le
ofrece descargar el `.ics`. Si quedó **pendiente**, dice «Solicitud enviada», le
explica que falta confirmar el horario y **no le ofrece calendario**
(`SlotPicker.js`, paso `done`).

### Quién recibe correo

| Quién | Qué recibe |
|---|---|
| El cliente, si está confirmada | Confirmación con el `.ics` |
| El cliente, si está pendiente | «Hemos recibido tu solicitud», **sin `.ics`** |
| Operaciones | Aviso de cita nueva, a `OPS_EMAIL` o, si no está, a `INTERNAL_EMAIL`. Si está pendiente, con un recuadro diciendo que hay que confirmarla, y un botón a la Agenda |
| El concesionario | **Nada** |

El vendedor solo recibe correo cuando la oferta es de un particular
(`sendBookingEmails`, rama `isParticular`). En una oferta de concesionario el
aviso va a operaciones, y es operaciones quien tiene que avisar al concesionario.

### Dónde se ve en el ERP

**Agenda** (menú lateral, `/bookings`), con dos partes:

- **Arriba, las pendientes**, si las hay: su propio bloque, sin acotar por fecha
  —son trabajo por hacer, y una que caiga fuera del rango elegido no puede
  desaparecer de la vista—, con **Confirmar** y **No puede ser**.
- **Debajo, las confirmadas**, ordenadas por fecha, con buscador y filtro de
  rango. Al desplegar una fila se ven el correo, el teléfono y las notas.

Una reserva que cayó en un horario generado por el sistema lleva la marca
**«horario sin confirmar»**, para verlo antes de presentarse y no en la puerta.

También se ve **por vehículo**, dentro de Marketplace → la oferta → panel de
visitas, que muestra los huecos y las reservas de ese coche en concreto.

### Qué puede ejecutar un trabajador, y qué pasa

| Acción | Qué hace | Qué **no** hace |
|---|---|---|
| **Confirmar** (solo pendientes) | Pasa la reserva a `confirmed` y **escribe al cliente** con el `.ics` | Avisar al concesionario |
| **Otra hora** | Mueve la visita al día y la hora que haya dado el concesionario, la deja confirmada y **escribe al cliente** con las dos horas, el `.ics` y un enlace por si no le viene bien | Avisar al concesionario |
| **Cancelar cita** | Marca la reserva como `cancelled`, devuelve el hueco a `available` y **escribe al cliente** con el motivo y un enlace para pedir otra hora | Avisar al concesionario |
| **Contactar** | Abre el correo con el asunto puesto | Nada automático |
| **Llamar** | Abre el teléfono | Nada automático |
| **Añadir o quitar huecos** | Publica disponibilidad para esa oferta, con `source: 'erp'` | — |

Todo queda en el registro de actividad: el middleware de auditoría anota
cualquier escritura que salga bien (`apps/api/src/app.ts:38`).

---

## Tres cosas que tenía este flujo, y cómo quedaron

Ninguna era un fallo de código —hacía lo que estaba escrito— pero las tres
cambiaban cómo hay que trabajarlo. Se documentan con lo que pasaba antes, porque
si no, dentro de un año nadie entiende por qué está montado así.

### Los horarios inventados — resuelto

Si una oferta de concesionario no tiene disponibilidad publicada, al primer
cliente que abre el calendario **se le generan huecos automáticamente**: lunes a
viernes, de 9 a 18, durante doce semanas, con `source: 'auto'`
(`seedProfessionalSlots`). Eso se queda: sin ellos, una oferta sin horarios
publicados no recibiría ni una visita.

Lo que cambia es lo que se promete encima de ellos. Antes la reserva nacía
`confirmed` y al cliente le llegaba el archivo de calendario, aunque nadie
hubiera dicho que el concesionario abre ese día.

**Ahora toda visita se aprueba.** Nace `pending`, y al cliente se le dice
«Pendiente de aprobación», sin `.ics`. Un `.ics` en el móvil de alguien es una
cita cerrada, y no lo es hasta que un trabajador ha llamado al concesionario.

Hubo un paso intermedio en que las reservas sobre huecos publicados desde el ERP
nacían confirmadas, con el argumento de que si alguien había publicado esa hora
ya estaba acordada. No se sostiene: que una hora esté publicada no significa que
el concesionario haya dicho que sí a **esta** visita, con este coche y esta
persona.

**Sigue mereciendo la pena** publicar los huecos reales desde el ERP: no salta la
aprobación, pero evita que el cliente pida un martes en un sitio que cierra los
martes, y aprobarla es entonces un trámite en vez de una negociación.

En la Agenda se distingue una cosa de otra: una reserva sobre un hueco inventado
lleva la marca **«horario sin confirmar»**.

### Cancelar desde el ERP — resuelto

Antes la ruta solo tocaba la base: el cliente no se enteraba y se presentaba
igual. La única defensa era acordarse de escribirle, y esa es una instrucción
que se incumple sola.

Ahora, al cancelar, el ERP pide un motivo —opcional— y **le manda un correo al
cliente** contándole qué visita se ha caído, por qué, y con un enlace para pedir
otra hora en ese mismo anuncio.

Dos detalles que importan:

- El correo sale **aunque haya un desvío de pruebas configurado**. Enterarse de
  que tu cita se ha caído no puede depender de una variable de entorno.
- Si el envío falla, **la cancelación se hace igual** —ya está hecha— pero la
  pantalla lo dice: «cancelada, pero no hemos podido avisar, llámale». Una cita
  cancelada de la que el cliente no se ha enterado no es lo mismo que una cita
  cancelada, y quien la cancela tiene que poder distinguirlo sin ir a mirar
  ningún registro.

### Mover la visita a otra hora

Es el caso de «ese día no, pero el jueves sí». Antes había que cancelar y esperar
a que el cliente volviera a pedir hora, con lo que eso tiene de que no vuelva.

Con **Otra hora**, el trabajador escribe el día y la hora que le haya dado el
concesionario. No se elige de una lista: el concesionario dice una hora concreta
y no tiene por qué estar publicada. Se guarda como hueco del ERP, que es lo que
es —una hora que ha puesto una persona— y **el hueco anterior vuelve a quedar
libre**, para que esa hora no se pierda.

La visita **queda confirmada**: quien tenía que aprobarla es quien ha propuesto
esta. Al cliente le llega un correo con **las dos horas** —la que era y la que
es, porque tiene la primera en la cabeza—, el `.ics` con la nueva y un enlace
para elegir otra si no le viene bien. Se la hemos movido sin preguntarle, así que
tiene que poder decir que no sin escribir a nadie.

Y se borran las marcas de aviso, que si no nadie recibiría el recordatorio de la
víspera: ya constaba como mandado para la fecha vieja.

Funciona igual sobre una pendiente y sobre una ya confirmada, porque un
concesionario puede cambiar de día después de haber dicho que sí.

Sigue sin avisarse al **concesionario**, ni al reservar, ni al confirmar, ni al
mover, ni al cancelar.

### Los recordatorios — resuelto

El cron de las 08:00 solo leía `moveadvisor_market_leads`, y estas reservas viven
en `vehicle_visit_bookings`. Nada las copiaba de una tabla a la otra, así que una
visita reservada desde el marketplace no recibía ni el aviso de la víspera, ni el
del día, ni el de después.

Ahora el cron recorre **las dos fuentes** con las mismas tres plantillas: la
reserva se traduce a la forma que ya esperaban, y los huecos que no tiene
—dirección, persona por la que preguntar— se quedan vacíos y no se pintan.

Tres detalles que importan:

- **Solo las confirmadas.** Recordarle a alguien una cita que todavía no le
  hemos dado es peor que no decirle nada.
- **El enlace de gestión es el suyo**, `/mi-cita` con su testigo, no el panel de
  solicitudes: quien reservó con el calendario puede no tener cuenta.
- **El seguimiento tiene ventana de tres días.** Sin ella, la primera ejecución
  habría mandado un «¿qué tal fue la visita?» a una reserva de hace un mes. Un
  seguimiento a destiempo no es un seguimiento.

Cada envío deja su marca —`reminder_sent_at`, `reminder_day_of_sent_at`,
`followup_sent_at`, añadidas en la migración `018`— y esa marca es la que impide
repetirlo.

Siguen siendo **dos sistemas de visitas en paralelo**, y unificarlos es una
migración de datos que no toca ahora:

| | Reserva del marketplace | Cita puesta desde el ERP |
|---|---|---|
| Quién la crea | El cliente, con el calendario | Un trabajador, en Leads |
| Dónde vive | `vehicle_visit_bookings` | `moveadvisor_market_leads` |
| Dónde se ve | Agenda | Leads |
| Recordatorios | Sí | Sí |
| Al hacer el seguimiento | Solo se apunta | Además pasa a «Visita realizada» |

---

## Lo que hace falta configurado

Variables que tocan este flujo. Ninguna rompe nada si falta, pero cada una
degrada algo en silencio, que es lo malo.

| Variable | Dónde | Si falta |
|---|---|---|
| `OPS_EMAIL` | PopCar | Los avisos de cita nueva caen en `INTERNAL_EMAIL` |
| `INTERNAL_EMAIL` | PopCar | Nadie recibe el aviso de cita nueva |
| `ERP_URL` | PopCar | El botón del aviso interno apunta al despliegue por defecto. Antes apuntaba a `erp.popcar.tech`, que **nunca se creó**: era un 404 |
| `PUBLIC_SITE_URL` | ERP | El enlace «pedir otra hora» del correo de cancelación se arma mal |
| `RESEND_TEST_EMAIL` | ERP | Se ignora en producción a propósito. Los correos de esta pantalla salen al cliente de todos modos |

La dirección del backoffice vive en `lib/marca.js` (`MARCA.urlErp`), no escrita a
mano en los handlers: `comprueba-marca.js` falla si alguien la vuelve a poner
suelta.

---

## Pendiente de documentar

- Oferta de particular: solicitar visita
- Oferta de importación: solicitar importación
- Oferta de renting: solicitar oferta
- Solicitud de servicio y taller
- Alertas de mercado
- Publicar un coche propio y su informe de estado
