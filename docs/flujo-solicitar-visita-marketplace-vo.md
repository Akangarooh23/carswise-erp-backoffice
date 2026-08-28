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
? ¿Qué contesta el concesionario?
rama Que sí | Puede | Queda confirmada. Le llega el calendario y **ya sale en su campana**
rama Otras horas | Propone otras horas | Sigue **pendiente**. Se le preguntan al cliente — abajo
rama Ya no hay coche | No puede ser | Se cancela con un motivo. Le llega el motivo y un enlace para pedir otra hora
:::

---

## Si el concesionario propone otras horas

No se le mueve la cita por nuestra cuenta. Se le pregunta, y sigue pendiente
hasta que conteste: no se le promete nada que no haya elegido él.

:::flujo
trabajador: En la Agenda, **Propone otras horas**. Las pone con calendario y reloj
sistema: Prepara el mensaje con las horas **numeradas**, para que pueda contestar «la 2»
? ¿Está WhatsApp conectado?
rama Sí | Se manda solo | Queda apuntado a qué número y qué se le dijo
rama No | Copiar mensaje | El texto sale en pantalla para mandarlo a mano. El paso se apunta igual
cliente: Contesta con la hora que le viene bien
trabajador: La aplica y marca **«la ha elegido el cliente»**
correo: **Al cliente** — su visita confirmada, con el calendario
trabajador: Avisa al concesionario de que el cliente va, y lo apunta
:::

---

## Los botones de la Agenda

### En una visita **por confirmar** (bloque de arriba)

| Botón | Qué hace |
|---|---|
| **Puede** | El concesionario ha dicho que sí. La cita queda confirmada, al cliente le llega el correo con el calendario y ya sale en su campana |
| **Propone otras horas** | Abre el diálogo para apuntar las que dio. Se le mandan al cliente y la cita **sigue pendiente** hasta que conteste |
| **No puede ser** | Cancela. Pide un motivo, que se le cuenta al cliente junto a un enlace para pedir otra hora |
| **Ver rastro** | Despliega los pasos dados, y los dos botones para apuntar lo que se hace por teléfono |

### En una visita **ya confirmada** (al desplegar la fila)

| Botón | Qué hace |
|---|---|
| **Cancelar cita** | Cancela con motivo y **escribe al cliente**. Si el correo falla, la pantalla lo dice para que le llames |
| **Otra hora** | La mueve al día y hora que le digas. Con una casilla para marcar si **la ha elegido el cliente**, porque entonces se le confirma en vez de decirle que se la hemos movido |
| **Contactar** | Abre tu correo con el asunto puesto. No hace nada automático |
| **Llamar** | Abre el teléfono del cliente. No hace nada automático |

El **identificador de la oferta** es un enlace: abre el anuncio real en otra
pestaña, para ver el coche antes de llamar al concesionario. Las ofertas de IDCar
no lo llevan, porque su ficha no tiene dirección propia.

## El rastro

Cada visita guarda los pasos que ha dado, con quién y cuándo. El estado dice
dónde está; el rastro dice cómo ha llegado. Se abre desde **Ver rastro**, en la
Agenda.

| Paso | Quién lo deja |
|---|---|
| El cliente pidió la visita | Solo, al reservar |
| Hablado con el concesionario | El trabajador, a mano |
| El concesionario propone otras horas | Al guardar las horas |
| Mandado al cliente por WhatsApp | Solo, si salió |
| El cliente eligió una hora | Al marcar la casilla |
| Cita confirmada, movida o cancelada | Solo, con la acción |
| Avisado el concesionario de que el cliente va | El trabajador, a mano |

Los dos que se apuntan a mano son cosas que pasan por teléfono: **si no se
apuntan, no existen para nadie más**, y el siguiente que abra la cita vuelve a
llamar o no llama.

Ninguna línea se borra nunca.

---

## Lo que hay que saber

**Toda visita se aprueba.** Ninguna se confirma sola, ni aunque el horario lo
hubiera publicado alguien desde el ERP. Que una hora esté publicada no significa
que el concesionario haya dicho que sí a esta visita.

**El calendario sale al confirmar, no al pedir.** Un `.ics` en el móvil de
alguien es una cita cerrada, y no lo es hasta que un trabajador ha llamado.

**La campana tampoco suena hasta que está confirmada.** Mientras está pendiente
es una precita. La ve en Solicitudes con su estado, que es donde toca.

**Al concesionario hay que llamarle a mano**, siempre. El sistema no le avisa: ni
al reservar, ni al confirmar, ni al mover, ni al cancelar.

**Si el horario lo generó el sistema**, la reserva lleva la marca «horario sin
confirmar» en la Agenda. Cuando una oferta no tiene disponibilidad publicada se
generan huecos de lunes a viernes de 9 a 18, y nadie los ha acordado.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Cuántas hay por confirmar | El número **ámbar** junto a Agenda, en el menú. Se refresca cada 30 segundos |
| Las visitas por confirmar | **Agenda**, bloque de arriba |
| Las confirmadas | **Agenda**, lista por fecha |
| El rastro de una visita | **Agenda** → Ver rastro |
| Las de un coche concreto | **Marketplace** → la oferta → panel de visitas |
| Publicar horarios reales | **Marketplace** → la oferta → añadir huecos |

## Lo que ve el cliente

| Estado | En su panel | En la campana | Qué recibe |
|---|---|---|---|
| Recién pedida | Pendiente de aprobación | No | Aviso de que la hemos recibido |
| Le hemos propuesto horas | Pendiente de aprobación | No | El WhatsApp con las opciones |
| Confirmada | Cita confirmada | Sí | Confirmación con el calendario |
| Movida por nosotros | Cita confirmada | Sí | Las dos horas y el calendario nuevo |
| Cancelada | Cancelado | No | El motivo y un enlace para pedir otra |

La sigue desde su panel y también desde el enlace de su correo, que abre su cita
sin pedirle contraseña.

## Para conectar WhatsApp

Hoy el mensaje sale en pantalla para mandarlo a mano. Para que salga solo hacen
falta dos variables en el ERP, y nada más — ninguna pantalla ni ninguna ruta
cambian:

| Variable | Qué es |
|---|---|
| `WHATSAPP_TOKEN` | El token permanente de la app de Meta |
| `WHATSAPP_PHONE_ID` | El identificador del número desde el que se escribe |

**El botón de copiar no sobra cuando se conecte.** WhatsApp solo deja escribir
libremente dentro de las 24 horas siguientes al último mensaje del cliente; fuera
de esa ventana hace falta una plantilla aprobada, así que seguirá haciendo falta
mandarlo a mano a veces.
