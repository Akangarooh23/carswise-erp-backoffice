# Flujo solicitar visita - Marketplace VO

Un cliente pide visita para un coche de concesionario. Qué pasa, quién lo hace y
en qué pantalla.

:::flujo
cliente: Entra en **Marketplace VO** y abre una oferta de concesionario
cliente: Pulsa **Solicitar visita** y elige día y hora
sistema: Guarda la reserva. **Siempre** queda pendiente de aprobación
correo: **Al cliente** — «Hemos recibido tu solicitud». Sin calendario
correo: **A operaciones** — cita nueva, con aviso de que hay que confirmarla
cliente: La ve en la **campana**, en **Inicio** y en **Solicitudes**
erp: Sale en **Agenda**, arriba, en «visitas por confirmar»
trabajador: **Llama al concesionario** y le pide la cita
? ¿Puede ese día y a esa hora?
rama Sí | Confirmar | La visita queda confirmada. Al cliente le llega el correo con el calendario
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

| Estado | En su panel | Qué recibe |
|---|---|---|
| Recién pedida | Pendiente de aprobación | Aviso de que la hemos recibido |
| Confirmada | Cita confirmada | Confirmación con el calendario |
| Movida | Cita confirmada | Las dos horas y el calendario nuevo |
| Cancelada | Cancelado | El motivo y un enlace para pedir otra |

La sigue desde su panel y también desde el enlace de su correo, que abre su cita
sin pedirle contraseña.
