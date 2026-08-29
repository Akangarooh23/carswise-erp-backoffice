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
rama Que sí | Confirmar | Se apunta **dónde es** y **por quién preguntar**. Queda confirmada y le llega el calendario
rama Otras horas | Propone otras horas | Sigue **pendiente**. Se le preguntan al cliente — abajo
rama Ya no hay coche | Cancelar cita | Se cancela con un motivo. Le llega el motivo y un enlace para pedir otra hora
:::

---

## Si el concesionario propone otras horas

No se le mueve la cita por nuestra cuenta. Se le pregunta, y sigue pendiente
hasta que conteste: no se le promete nada que no haya elegido él.

:::flujo
trabajador: En la Agenda, **Propone otras horas**. Las pone con calendario y reloj
correo: **Al cliente** — las horas, **cada una un botón** para pinchar
sistema: Y por WhatsApp, si está conectado: las mismas horas, también como botones
? ¿Qué hace el cliente?
rama Pincha una hora | Se cierra sola | Queda **confirmada** a esa hora y le llega el calendario. No hay que teclear nada
rama Contesta por teléfono | El cliente ha elegido hora | El trabajador pincha la que dijo, en la Agenda
rama No contesta | Se le llama | Sigue pendiente hasta que conteste
trabajador: Avisa al concesionario de que el cliente va, y lo apunta
:::

### Cuando pincha una hora, se cierra sola

El correo lleva un botón por hora. Al pinchar se abre una página suya —sin
contraseña, con el enlace de su cita— con las horas para elegir. Confirma, y la
visita queda cerrada a esa hora: le sale el correo con el calendario, y a
operaciones un aviso de que ha contestado, porque **al concesionario hay que
llamarle a mano igual**.

No se aplica con solo abrir el enlace, hace falta ese segundo toque. Los
lectores de correo abren solos los enlaces para comprobarlos, y una cita no
puede quedar confirmada porque un antivirus haya mirado el mensaje.

Solo valen las horas que se le propusieron. Y si mientras tanto la ha confirmado
un trabajador por teléfono, no se pisa: se le dice que ya está confirmada.

### Si contesta por teléfono o por WhatsApp

Se aplica a mano con **El cliente ha elegido hora**, en la Agenda. La hora no hay
que teclearla: salen las que se le propusieron y se pincha la que dijo. Si el
concesionario acaba dando una distinta, se escribe a mano debajo.

---

## Los botones de la Agenda

### En una visita **por confirmar** (bloque de arriba)

| Botón | Qué hace |
|---|---|
| **Confirmar** | El concesionario ha dicho que sí. Pide **dónde es** y **por quién preguntar**, y con eso confirma: al cliente le llega el correo con esos datos y el calendario, y ya sale en su campana |
| **Propone otras horas** | Abre el diálogo para apuntar las que dio. Se le mandan al cliente y la cita **sigue pendiente** hasta que conteste |
| **El cliente ha elegido hora** | Cuando contesta al WhatsApp diciendo que le vale una de las que se le propusieron. Salen las horas propuestas para pincharlas, y con eso la visita queda confirmada a esa hora: al cliente se le confirma, no se le dice que se la hemos movido |
| **Cancelar cita** | Cancela. Pide un motivo, que se le cuenta al cliente junto a un enlace para pedir otra hora |
| **Ver rastro** | Despliega los pasos dados, los dos botones para apuntar lo que se hace por teléfono, y el sitio para escribir notas |

Dónde es y por quién preguntar **se guardan**, así que van también en los
recordatorios y en la página de su cita. Si se dejan en blanco la cita se
confirma igual, y al cliente se le dice que le confirmaremos la dirección antes
de la visita — **y entonces hay que cumplirlo**, con el botón de abajo.

### En una visita **ya confirmada**

Se despliega pinchando en la **cabecera** de la fila —la hora, el coche y el
nombre—. Dentro del detalle se puede escribir y seleccionar sin que se cierre.

| Botón | Qué hace |
|---|---|
| **Cancelar cita** | Cancela con motivo y **escribe al cliente**. Si el correo falla, la pantalla lo dice para que le llames |
| **Apuntar el sitio** | Dónde es y por quién preguntar, cuando no se sabían al confirmar. Con una casilla para escribírselo al cliente: la hora no cambia y no se le manda el calendario otra vez. Si ya estaban puestos, el botón dice **Cambiar el sitio** |
| **Otra hora** | La mueve al día y hora que le digas. Con una casilla para marcar si **la ha elegido el cliente**, porque entonces se le confirma en vez de decirle que se la hemos movido |
| **Contactar** | Abre tu correo con el asunto puesto. No hace nada automático |
| **Llamar** | Abre el teléfono del cliente. No hace nada automático |
| **Ver rastro y notas** | Lo mismo que en las pendientes: lo que pasa después de confirmar también hay que poder apuntarlo |

### La marca «hora propuesta por el sistema»

Solo sale **mientras está pendiente**, y dice que ese hueco lo generó el sistema
—nadie había acordado esa hora—. En cuanto se confirma deja de salir: la hora ya
está acordada, y seguir avisando de lo contrario confunde.

El **identificador de la oferta** es un enlace: abre la ficha del coche en el
marketplace VO, en otra pestaña, para verlo antes de llamar.

Vale para todas. Las de IDCar también están publicadas en el marketplace VO, en
la sección de **particulares** —van con `seller_type` de particular—, así que
tienen su ficha igual que las de concesionario.

Va a **nuestra ficha** y no al anuncio del portal de origen, porque los coches
que no vienen de un portal no tienen anuncio propio en internet. La ficha del
marketplace la tienen todos.

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
| Mandadas al cliente por correo, para que elija | Solo, al proponer |
| El cliente eligió una hora | Solo si la pincha él; a mano si contesta por teléfono |
| Apuntado dónde es y por quién preguntar | El trabajador, al guardarlo |
| Mandado el sitio al cliente | Solo, si marcó la casilla |
| **Nota** | El trabajador, escribiéndola |
| Cita confirmada, movida o cancelada | Solo, con la acción |
| Avisado el concesionario de que el cliente va | El trabajador, a mano |

Los que se apuntan a mano son cosas que pasan por teléfono: **si no se apuntan,
no existen para nadie más**, y el siguiente que abra la cita vuelve a llamar o no
llama.

### Las notas

Se escriben en el rastro, y quedan con quién las escribió y cuándo. **No son un
campo que se edita**: dos personas llevando la misma cita se pisarían el texto, y
lo que se apunta de una gestión no se corrige, se añade.

Ninguna línea se borra nunca.

---

## Si el cliente se cambia la hora

Desde el enlace de su correo puede mover su cita él mismo. Cuando lo hace,
**vuelve a quedar pendiente** y aparece otra vez en el bloque de arriba de la
Agenda, para aprobarla de nuevo.

Es lo mismo de siempre: la hora nueva la ha elegido él, sobre huecos que tampoco
ha acordado el concesionario. Toda visita se aprueba, también esta.

Al cliente se le dice que hemos cambiado la hora y que falta confirmarla, no que
ya está reprogramada, y el cambio queda en el rastro a su nombre.

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
| Cuántas hay por confirmar | El número **rojo** junto a Agenda, en el menú. Se refresca cada 30 segundos |
| Las visitas por confirmar | **Agenda**, bloque de arriba. También las que se pasaron de fecha, marcadas: son personas a las que no contestamos |
| Las confirmadas | **Agenda**, lista por fecha. Con **Todas** salen también las de los tres meses anteriores |
| El rastro de una visita | **Agenda** → Ver rastro |
| Las de un coche concreto | **Marketplace** → la oferta → panel de visitas, cada una con su estado |
| Publicar horarios reales | **Marketplace** → la oferta → añadir huecos |

## Lo que ve el cliente

| Estado | En su panel | En la campana | Qué recibe |
|---|---|---|---|
| Recién pedida | Pendiente de aprobación | No | Aviso de que la hemos recibido |
| Le hemos propuesto horas | Te esperamos: elige una hora, con botón | No | Un correo con las horas para pinchar, y el WhatsApp si está conectado |
| **Se ha cambiado la hora él** | Pendiente de aprobación | No | Que hemos cambiado la hora y falta confirmarla |
| Confirmada | Cita confirmada | Sí | Confirmación con el calendario, dónde es y por quién preguntar |
| Movida por nosotros | Cita confirmada | Sí | Las dos horas y el calendario nuevo |
| Cancelada | Cancelado | No | El motivo y un enlace para pedir otra |

En su solicitud tiene un enlace **«Ver el coche»** que abre la ficha del vehículo,
para no tener que buscarlo otra vez.

Las horas que le proponemos salen también en **Solicitudes**, con un botón para
elegir: el correo se pierde, y quien lo pierde se quedaba sin poder contestar.
Desaparece solo en cuanto elige una.

Dónde es y por quién preguntar salen en su cita, no solo en el correo: el correo
se pierde y esa página se guarda. Y para cambiar la hora o cancelar se le manda
a **Solicitudes**, que es donde tiene los dos botones, en vez de a contestar un
correo que alguien tiene que leer.

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

| `WHATSAPP_VERIFY_TOKEN` | Una palabra que eliges tú, para dar de alta el webhook |
| `WHATSAPP_APP_SECRET` | El secreto de la app de Meta. Con él se comprueba que lo que llega al webhook lo manda Meta y no cualquiera |

En la app de Meta, el webhook va a `https://<esta-api>/api/whatsapp/webhook`, con
ese mismo token de verificación.

Las horas se mandan **como botones** cuando son tres o menos, que es el máximo de
WhatsApp. El cliente pulsa uno y la visita queda confirmada sola, igual que por
el correo. Con cuatro o más horas no hay botones que valgan y sale el texto
numerado, para que conteste «la 2» y se aplique a mano: recortarle horas que el
concesionario sí ofrece es peor que pedirle que escriba.

**El botón de copiar no sobra cuando se conecte.** WhatsApp solo deja escribir
libremente dentro de las 24 horas siguientes al último mensaje del cliente; fuera
de esa ventana hace falta una plantilla aprobada, así que seguirá haciendo falta
mandarlo a mano a veces.

Y el correo sale siempre, esté WhatsApp conectado o no: es el camino que no
depende de que el cliente tenga el número guardado ni de ninguna ventana de 24
horas.
