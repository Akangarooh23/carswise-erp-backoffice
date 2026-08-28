# Flujo solicitar visita - Marketplace VO

Un cliente pide visita para un coche de concesionario. Qué pasa, quién lo hace y
en qué pantalla.

:::flujo
cliente: Entra en **Marketplace VO** y abre una oferta de concesionario
cliente: Pulsa **Solicitar visita** y elige día y hora
sistema: Guarda la reserva. **Siempre** queda pendiente de aprobación
correo: **Al cliente** — «Hemos recibido tu solicitud». Sin calendario
correo: **A operaciones** — cita nueva, con aviso de que hay que confirmarla
cliente: La ve en **Solicitudes**, como pendiente. Todavía **no** en la campana
erp: Sale en **Agenda**, arriba, en «visitas por confirmar»
trabajador: **Llama al concesionario** y le pide la cita
? ¿Puede ese día y a esa hora?
rama Sí | Confirmar | Queda confirmada. Le llega el calendario y **ya sale en su campana**
rama Otro día | Otra hora | Se mueve al día que diga. Al cliente le llegan las dos horas y el calendario nuevo
rama No puede | No puede ser | Se cancela con un motivo. Al cliente le llega el motivo y un enlace para pedir otra hora
sistema: Si queda confirmada: **recordatorio la víspera**, **el mismo día** y **seguimiento** después
:::

---

## Lo que hay que saber

**Toda visita se aprueba.** Ninguna se confirma sola, ni aunque el horario lo
hubiera publicado alguien desde el ERP. Que una hora esté publicada no significa
que el concesionario haya dicho que sí a esta visita.

**El calendario sale al confirmar, no al pedir.** Un `.ics` en el móvil de
alguien es una cita cerrada, y no lo es hasta que un trabajador ha llamado.

**La campana tampoco suena hasta que está confirmada.** Mientras está pendiente
es una precita: la ha pedido, pero nadie ha dicho aún que sí. Avisarle de ella
sería prometerle una cita que quizá no llegue a existir. La ve en Solicitudes con
su estado, que es donde toca.

**Al concesionario hay que llamarle a mano.** El sistema no le avisa: ni al
reservar, ni al confirmar, ni al mover, ni al cancelar. Es el único paso que
depende de que alguien se acuerde.

**Si el horario lo generó el sistema**, la reserva lleva la marca «horario sin
confirmar» en la Agenda. Cuando una oferta no tiene disponibilidad publicada se
generan huecos de lunes a viernes de 9 a 18, y nadie los ha acordado.

**Cancelar y mover avisan al cliente.** Si el correo fallara, la pantalla lo dice
para que le llames.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Las visitas por confirmar | **Agenda**, bloque de arriba |
| Las confirmadas | **Agenda**, lista por fecha |
| Las de un coche concreto | **Marketplace** → la oferta → panel de visitas |
| Publicar horarios reales | **Marketplace** → la oferta → añadir huecos |

## Lo que ve el cliente

| Estado | En su panel | En la campana | Qué recibe |
|---|---|---|---|
| Recién pedida | Pendiente de aprobación | No | Aviso de que la hemos recibido |
| Confirmada | Cita confirmada | Sí | Confirmación con el calendario |
| Movida | Cita confirmada | Sí | Las dos horas y el calendario nuevo |
| Cancelada | Cancelado | No | El motivo y un enlace para pedir otra |

La sigue desde su panel y también desde el enlace de su correo, que abre su cita
sin pedirle contraseña.
