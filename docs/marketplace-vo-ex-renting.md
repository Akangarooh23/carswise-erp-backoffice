# Marketplace VO — Ex-Renting

Un cliente pide visita para un coche de la sección **Ex-Renting**: flota que
devuelven las empresas de renting y que se vende de segunda mano. Hoy son
**Astara** y **Leasys**.

El camino es el mismo que el de un coche de concesionario —se pide, se aprueba,
se confirma— y lo que cambia es **a quién se llama y qué se sabe del coche**. Eso
va primero.

## Lo que cambia respecto a un concesionario

| | Concesionario | Ex-Renting |
|---|---|---|
| Quién tiene el coche | Un concesionario, con su tienda | Una empresa de renting: Astara, Leasys |
| Su teléfono | Suele estar en su anuncio | **Solo el que se haya puesto en la ficha de la oferta** |
| El enlace de **origen** | Su anuncio, con teléfono | Un **informe de inspección de DEKRA**. Ni anuncio ni teléfono, y algunos piden usuario |
| Dónde se ve el coche | En su tienda | Donde diga la empresa: suele ser un centro logístico, no una tienda |
| Contacto | Uno por concesionario | **Uno para toda la flota**: los 95 coches de Astara llevan el mismo |

Por eso, con un ex-renting, **lo primero es mirar si la oferta tiene teléfono**.
La Agenda lo enseña junto a quién vende, y si falta lo dice: «sin teléfono». Se
pone una sola vez en **Marketplace → la oferta → Teléfono de quien vende**, y
sirve para todos los coches de esa empresa.

---

## Cómo va, de principio a fin

:::flujo
cliente: Entra en **Marketplace VO**, pestaña **Ex-Renting**, y abre un coche
cliente: Pulsa **Solicitar visita** y elige día y hora
sistema: Guarda la reserva. **Siempre** queda pendiente de aprobación
correo: **Al cliente** — «Hemos recibido tu solicitud». Sin calendario
correo: **A operaciones** — cita nueva, con aviso de que hay que confirmarla
erp: Sale en **Agenda**, arriba, en «visitas por confirmar», con la marca **Ex-renting**
trabajador: **Llama a la empresa** con el teléfono de la ficha y pide la cita
? ¿Qué contestan?
rama Que sí | Confirmar | Se apunta **dónde es** y **por quién preguntar**. Queda confirmada y al cliente le llega el calendario
rama Otras horas | Propone otras horas | Sigue **pendiente**. Se le preguntan al cliente — abajo
rama Ya no está | Cancelar cita | Se cancela con un motivo. Le llega el motivo y un enlace para pedir otra hora
:::

**Dónde es importa más que en un concesionario.** El coche no está en una tienda
que el cliente pueda buscar en un mapa: está donde la empresa lo tenga. Si se
confirma sin dirección, al cliente se le dice que se la daremos antes de la
visita, y entonces hay que dársela.

---

## Si dan otras horas

No se le mueve la cita al cliente por nuestra cuenta. Se le pregunta, y sigue
pendiente hasta que conteste.

:::flujo
trabajador: En la Agenda, **Propone otras horas**. Las pone con calendario y reloj
trabajador: Lee **lo que va a leer el cliente** y le da a enviar. Hasta ahí no sale nada
correo: **Al cliente** — las horas, **cada una un botón** para pinchar
sistema: Y por WhatsApp, si está conectado: las mismas horas, también como botones
? ¿Qué hace el cliente?
rama Pincha una hora | Se cierra sola | Queda **confirmada** a esa hora y le llega el calendario
rama Contesta por teléfono | El cliente ha elegido hora | El trabajador pincha la que dijo, en la Agenda
rama No contesta | Se le llama | Sigue pendiente hasta que conteste
trabajador: Avisa a la empresa de que el cliente va, y lo apunta
:::

Al pinchar una hora se le abre una página suya —sin contraseña, con el enlace de
su cita— y confirma ahí. Solo valen las horas que se le propusieron, y si mientras
tanto la ha confirmado un trabajador, no se pisa.

**A la empresa hay que avisarla a mano igual.** De que el cliente ha elegido hora
no se entera sola: el sistema no le escribe nunca, ni al reservar, ni al
confirmar, ni al mover, ni al cancelar.

---

## Los botones de la Agenda

### En una visita **por confirmar** (bloque de arriba)

| Botón | Qué hace |
|---|---|
| **Confirmar** | Han dicho que sí. Pide **dónde es** y **por quién preguntar**, y con eso confirma: al cliente le llega el correo con esos datos y el calendario |
| **Propone otras horas** | Se apuntan las que dieron, y antes de mandar nada **se enseña lo que va a leer el cliente**: el correo entero y el texto del WhatsApp. Desde ahí se cambia o se envía |
| **El cliente ha elegido hora** | Cuando contesta diciendo que le vale una. Salen las propuestas para pinchar la que dijo, y la visita queda confirmada a esa hora |
| **Cancelar cita** | Cancela. Pide un motivo, que se le cuenta al cliente junto a un enlace para pedir otra hora |
| **Ver rastro** | Los pasos dados, los botones para apuntar lo que se hace por teléfono, y el sitio para escribir notas |

### En una visita **ya confirmada**

Se despliega pinchando en la **cabecera** de la fila.

| Botón | Qué hace |
|---|---|
| **Cancelar cita** | Cancela con motivo y escribe al cliente. Si el correo falla, la pantalla lo dice para que le llames |
| **Apuntar el sitio** | Dónde es y por quién preguntar, cuando no se sabían al confirmar. Con una casilla para escribírselo al cliente |
| **Otra hora** | La mueve al día y hora que le digas. Con una casilla para marcar si **la ha elegido el cliente** |
| **Contactar** · **Llamar** | Abren tu correo o el teléfono **del cliente**. No hacen nada automático |
| **Ver rastro y notas** | Lo mismo que en las pendientes |

### La marca «hora propuesta por el sistema»

Sale mientras está pendiente y dice que ese hueco lo generó el sistema —lunes a
viernes de 9 a 18—, no lo acordó nadie. Con ex-renting es lo normal: esas
empresas no publican horarios, así que **casi todas las visitas llegan sobre una
hora inventada** y hay que acordarla por teléfono.

Si con alguna se pactan horas fijas, se publican en **Marketplace → la oferta →
añadir huecos** y dejan de salir inventadas.

## El rastro

Cada visita guarda los pasos que ha dado, con quién y cuándo. El estado dice
dónde está; el rastro dice cómo ha llegado.

| Paso | Quién lo deja |
|---|---|
| El cliente pidió la visita | Solo, al reservar |
| Hablado con el vendedor | El trabajador, a mano |
| El vendedor propone otras horas | Al guardar las horas |
| Mandadas al cliente por correo, para que elija | Solo, al proponer |
| Mandado al cliente por WhatsApp | Solo, si salió |
| El cliente eligió una hora | Solo si la pincha él; a mano si contesta por teléfono |
| Apuntado dónde es y por quién preguntar | El trabajador, al guardarlo |
| **Nota** | El trabajador, escribiéndola |
| Cita confirmada, movida o cancelada | Solo, con la acción |
| Avisado el vendedor de que el cliente va | El trabajador, a mano |

Lo que se apunta a mano son cosas que pasan por teléfono: **si no se apuntan, no
existen para nadie más**. Ninguna línea se borra nunca.

---

## Lo que hay que saber

**Toda visita se aprueba.** Ninguna se confirma sola. Que una hora aparezca en el
calendario del cliente no significa que la empresa haya dicho que sí a esta
visita.

**El calendario sale al confirmar, no al pedir.** Una cita metida en el móvil de
alguien es una cita cerrada, y no lo es hasta que un trabajador ha llamado.

**La campana del cliente tampoco suena hasta que está confirmada.** Mientras
está pendiente es una precita, y la ve en Solicitudes con su estado.

**Si el cliente se cambia la hora** desde el enlace de su correo, la visita
**vuelve a quedar pendiente** y aparece otra vez arriba en la Agenda. Hay que
volver a llamar: la hora nueva tampoco la ha acordado nadie.

**Todos estos coches llevan informe de inspección.** El enlace de origen de la
oferta es ese informe, de DEKRA. Hoy **no se le enseña al cliente** y algunos
piden usuario para abrirse: si pregunta por el estado del coche, eso se mira
antes de contestarle, no se le reenvía sin más.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Cuántas hay por confirmar | El número **rojo** junto a Agenda, en el menú |
| Las visitas por confirmar | **Agenda**, bloque de arriba. También las que se pasaron de fecha, marcadas |
| Las confirmadas | **Agenda**, lista por fecha |
| El teléfono de la empresa | **Marketplace** → la oferta → Teléfono de quien vende |
| Las visitas de un coche | **Marketplace** → la oferta → panel de visitas |
| Publicar horarios reales | **Marketplace** → la oferta → añadir huecos |

## Lo que ve el cliente

| Estado | En su panel | En la campana | Qué recibe |
|---|---|---|---|
| Recién pedida | Pendiente de aprobación | No | Aviso de que la hemos recibido |
| Le hemos propuesto horas | Te esperamos: elige una hora, con botón | No | Correo con las horas para pinchar, y el WhatsApp si está conectado |
| Se ha cambiado la hora él | Pendiente de aprobación | No | Que hemos cambiado la hora y falta confirmarla |
| Confirmada | Cita confirmada | Sí | Confirmación con calendario, dónde es y por quién preguntar |
| Cancelada | Cancelado | No | El motivo y un enlace para pedir otra |

El cliente **no ve** de quién es el coche más allá de lo que diga el anuncio, ni
el teléfono de la empresa, ni la persona de contacto hasta que se le confirma la
visita. Eso es de trabajo interno.
