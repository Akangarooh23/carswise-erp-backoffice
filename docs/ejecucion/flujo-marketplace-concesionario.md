# Flujo marketplace — concesionario

Una visita a un coche que **no es nuestro**: lo tiene un concesionario, y lo
único que hacemos es concertar que el cliente vaya a verlo. Caja a caja, con la
pantalla y los datos de cada paso.

El color dice quién lo hace: azul el cliente, gris lo que pasa solo, morado un
correo que sale, verde algo que se hace en el ERP y amarillo algo que hace una
persona por su cuenta —llamar, sobre todo—.

Para los de **Ex-Renting** —Astara, Leasys— el camino es el mismo; cambia a
quién se llama. Y el **por qué** de todo esto está en el manual de negocio
«Marketplace VO — Concesionario»: aquí solo está el cómo.

---

## De un vistazo

:::flujo
erp: El coche está publicado y con el teléfono de quien lo vende
@ Marketplace → VO Concesionarios → la oferta
+ tipo de vendedor «Concesionario» y el teléfono, sin eso no se puede llamar
cliente: Abre la oferta y pide visita a una hora
@ En PopCar, no en el ERP — la misma ficha que se ve en **Marketplace**
+ nada: la elige él, y siempre queda pendiente
sistema: Queda pendiente de aprobación, y no le llega calendario
@ Agenda → el bloque de arriba, «visitas por confirmar»
+ nada: entra sola
trabajador: Se llama al concesionario. El sistema no le avisa nunca
@ Agenda → la visita → el teléfono de «Vende», pinchable
+ nada: se llama, y lo que conteste decide el paso siguiente
erp: Si dice que sí, se confirma
@ Agenda → la visita → «Confirmar»
+ dónde es y por quién preguntar
erp: Si da otras horas, se le preguntan al cliente
@ Agenda → la visita → «Propone otras horas»
+ día y hora de cada una, hasta seis
erp: Si ya no hay coche, se cancela con un motivo
@ Agenda → la visita → «Cancelar cita»
+ el motivo, que se le cuenta al cliente tal cual
erp: Se apunta lo hablado por teléfono, porque si no, no existe
@ Agenda → la visita → «Ver rastro»
+ los dos botones de la llamada, y una nota con lo que dijo
:::

Ocho pasos, y solo uno de ellos —la llamada— pasa fuera del ERP. Lo que sigue es
cada uno con su pantalla.

---

## 1 · Antes de nada: que el coche se pueda visitar

Una oferta sin teléfono de vendedor es una visita que no se puede confirmar: hay
que llamar, y no hay a quién.

:::flujo
erp: Abrir la oferta del concesionario
@ Marketplace → VO Concesionarios → la fila del coche
+ nada: se busca por marca, modelo o vendedor
erp: Comprobar los tres datos que hacen falta
@ Marketplace → la oferta → «Vendedor»
+ «Tipo de vendedor» en Concesionario, «Vendedor» con su nombre y «Teléfono de quien vende»
erp: Publicar los huecos reales, si los sabemos
@ Marketplace → la oferta → «Disponibilidad y citas» → «Franjas horarias»
+ día, desde y hasta, de cada franja
erp: Y que la oferta esté publicada
@ Marketplace → la oferta → «Publicado en marketplace»
+ nada: es una casilla
:::

> **Dónde se dan de alta.** Los coches de concesionario viven en la misma tabla
> que los de VO Empresas Renting, así que se añaden desde **VO Empresas
> Renting** —«+ Añadir vehículo» o «Importar Excel»—, y saltan a **VO
> Concesionarios** en cuanto el tipo de vendedor dice Concesionario. La pestaña
> de concesionarios solo exporta: no tiene botón de alta.

> **Si no hay franjas, el sistema se las inventa.** Genera huecos de lunes a
> viernes de 9 a 18, y en la Agenda la visita sale marcada como «horario sin
> confirmar». Nadie ha acordado esa hora con nadie.

---

## 2 · El cliente pide la visita

Aquí no hay nada que hacer. Se cuenta para saber qué ha visto él.

:::flujo
cliente: Pulsa **Solicitar visita** en la ficha y elige día y hora
sistema: Se guarda pendiente de aprobación. **Siempre**, sin excepción
correo: **Al cliente** — que la hemos recibido. Sin calendario
correo: **A operaciones** — cita nueva, y que hay que confirmarla
cliente: La ve en **Solicitudes** como pendiente. Todavía no en su campana
erp: Y a nosotros nos sale arriba del todo
@ Agenda → «visitas por confirmar»
:::

> El número **rojo** junto a Agenda, en el menú, dice cuántas esperan. Se
> refresca solo cada 30 segundos.

---

## 3 · La llamada, y sus tres finales

:::flujo
erp: Abrir la visita y mirar quién vende
@ Agenda → el bloque de arriba → la línea «Vende»
+ nada: sale el nombre, el tipo y el teléfono
trabajador: Llamar al concesionario y pedirle la cita
? ¿Qué contesta?
rama Que sí | Confirmar | Queda confirmada y al cliente le llega el calendario
rama Otras horas | Propone otras horas | Sigue **pendiente**: se le preguntan al cliente
rama Ya no hay coche | Cancelar cita | Se cancela con un motivo, y él puede pedir otra
:::

Mientras esté pendiente, al cliente no se le ha prometido nada: lo sabe, y no
tiene la cita en el móvil.

### Si dice que sí

:::flujo
erp: Pulsar **Confirmar**
@ Agenda → la visita → «Confirmar»
+ nada: abre un diálogo antes de confirmar nada
erp: Escribir los dos datos que van en su correo
@ Agenda → «Confirmar la visita» → «Dónde es» y «Por quién preguntar»
+ la calle y el número o el nombre del sitio, y el nombre de quien le atiende
erp: Y cerrarla
@ Agenda → «Confirmar la visita» → «Confirmar y avisar»
correo: **Al cliente** — la confirmación, el calendario, dónde es y por quién preguntar
sistema: Ya le sale en la campana, y pasa a la lista de confirmadas
:::

> Los dos datos se pueden dejar en blanco y la cita se confirma igual, pero
> entonces al cliente se le dice que le confirmaremos la dirección antes de la
> visita — **y hay que cumplirlo**, con «Apuntar el sitio».

### Si propone otras horas

No se le mueve la cita por nuestra cuenta: se le preguntan y sigue pendiente
hasta que conteste.

:::flujo
erp: Poner las horas que dio el concesionario
@ Agenda → la visita → «Propone otras horas»
+ día y hora de cada una; con «Añadir otra hora» caben hasta seis
erp: Leer lo que va a leer el cliente
@ Agenda → «Horas que propone el concesionario» → «Ver lo que se le manda»
+ nada: sale el correo entero y el texto del WhatsApp, y todavía no ha salido nada
erp: Enviarlo
@ Agenda → el borrador → «Enviar al cliente»
correo: **Al cliente** — las horas, **cada una un botón** para pinchar
sistema: Y el WhatsApp: si no sale solo, se copia con «Copiar mensaje» y se manda a mano
? ¿Qué hace el cliente?
rama Pincha una hora | Se cierra sola | Queda confirmada a esa hora y le llega el calendario
rama Contesta por teléfono | El cliente ha elegido hora | Se pincha la que dijo, y con eso queda confirmada
rama No contesta | Se le llama | Sigue pendiente. Nadie le ha prometido ninguna hora
:::

> Cuando la pincha él, la cita se cierra sola y a operaciones le llega un aviso
> — porque **al concesionario hay que llamarle a mano igual**.

> El correo con las horas sale siempre, esté el WhatsApp conectado o no: es el
> camino que no depende de tener el número guardado.

### Si ya no hay coche

:::flujo
erp: Cancelar con un motivo
@ Agenda → la visita → «Cancelar cita»
+ el motivo, escrito para que lo lea el cliente
correo: **Al cliente** — el motivo, y un enlace para pedir otra hora
:::

> El motivo se le manda tal cual, así que se escribe pensando en él: «el coche ya
> no está disponible», no «no coge el teléfono».

---

## 4 · Antes de la visita

:::flujo
erp: Apuntar dónde es, si no se supo al confirmar
@ Agenda → la visita confirmada → «Apuntar el sitio»
+ dónde es, por quién preguntar, y si se le escribe al cliente
erp: Moverla, si cambia el día
@ Agenda → la visita confirmada → «Otra hora»
+ el día y la hora nuevos, y si la ha elegido el cliente
erp: Avisar al concesionario de que el cliente va
@ Agenda → la visita → «Ver rastro» → «Le he dicho que el cliente va»
:::

> La casilla **«la ha elegido el cliente»** cambia lo que se le escribe: si la
> eligió él se le confirma, y si no, se le dice que se la hemos movido. No es lo
> mismo, y el correo lo nota.

Una visita confirmada se despliega pinchando en su **cabecera** —la hora, el
coche y el nombre—. Dentro se puede escribir sin que se cierre.

---

## 5 · El rastro, que es donde vive lo que pasa por teléfono

:::flujo
erp: Apuntar que has hablado con el concesionario
@ Agenda → la visita → «Ver rastro» → «He llamado al concesionario»
erp: Apuntar que ya sabe que el cliente va
@ Agenda → la visita → «Ver rastro» → «Le he dicho que el cliente va»
erp: Y lo que no cabe en un botón, en una nota
@ Agenda → «Ver rastro» → «Añadir una nota»
+ lo que dijo, quién llamó, lo que quedó pendiente
:::

> Los dos botones salen igual en una visita **pendiente** y en una
> **confirmada**: avisar al concesionario de que el cliente va pasa después de
> confirmar, y ahí es donde más falta hace poder apuntarlo.

Lo demás se apunta solo: quién pidió la visita, las horas propuestas, lo que se
le mandó, y cada confirmación, cambio o cancelación. Ninguna línea se borra
nunca, y las notas quedan con quién las escribió y cuándo.

**Lo que no se apunta no existe para nadie más**, y el siguiente que abra la cita
vuelve a llamar — o no llama.

---

## 6 · Si el cliente se cambia la hora

:::flujo
cliente: La mueve desde el enlace de su correo, o desde **Solicitudes**
sistema: Vuelve a quedar pendiente y sale otra vez arriba en la Agenda
correo: **Al cliente** — que hemos cambiado la hora y falta confirmarla
erp: Se vuelve a llamar al concesionario y se aprueba otra vez
@ Agenda → el bloque de arriba
:::

Es lo de siempre: la hora nueva la ha elegido él, sobre huecos que tampoco ha
acordado el concesionario. **Toda visita se aprueba**, también esta.

---

## Lo que el sistema no hace

| No hace | Lo hace una persona |
|---|---|
| Avisar al concesionario de nada: ni al reservar, ni al confirmar, ni al mover, ni al cancelar | Llamarle, siempre |
| Confirmar una visita sola, aunque el horario estuviera publicado | Confirmarla después de la llamada |
| Mandar el calendario al pedir la cita | Sale al confirmar, no antes |
| Sonar en la campana del cliente mientras está pendiente | Mientras tanto la ve en Solicitudes |

La única excepción es el **particular**: de ese sí tenemos el correo, y se le
escribe solo al reservar. Del concesionario no.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Cuántas visitas esperan | El número rojo junto a **Agenda**, en el menú |
| Las que hay que confirmar | **Agenda**, bloque de arriba. Con las que se pasaron de fecha marcadas |
| Las confirmadas | **Agenda**, por fecha. Con «Todas» salen las de los tres meses anteriores |
| El rastro de una visita | **Agenda** → Ver rastro |
| Las visitas de un coche | **Marketplace** → la oferta → panel de visitas |
| El teléfono del vendedor | **Marketplace** → la oferta → «Teléfono de quien vende» |
| Publicar horarios reales | **Marketplace** → la oferta → «Franjas horarias» |
