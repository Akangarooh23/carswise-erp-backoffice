# Flujo de importación

Todo el camino de un coche de Alemania, caja a caja. **Cada caja dice en qué
pantalla se hace y qué datos se meten**, para poder seguirlo con el ERP abierto
al lado.

El color de la caja dice quién lo hace: azul el cliente, gris lo que pasa solo,
morado un correo que sale, verde algo que se hace en el ERP y amarillo algo que
hace una persona por su cuenta —una llamada, ir a un sitio—.

Si lo que buscas es **por qué** las cosas son así, eso está en los manuales de
negocio: aquí solo está el cómo.

---

## De un vistazo

:::flujo
cliente: Pide el coche desde la ficha del marketplace
@ En PopCar, no en el ERP — **Marketplace VO → Importación**
+ sus datos, la dirección de entrega y la garantía que elija
cliente: Transfiere el depósito a la cuenta
@ Importaciones → el coche → «El depósito»
+ nada: entra solo. Aquí solo se comprueba que está dentro
erp: Se le pregunta al vendedor si sigue disponible
@ Importaciones → el coche → «Preguntar al vendedor»
+ nada: el correo se escribe solo, se revisa y se manda
erp: Se encarga la peritación y va alguien a verlo
@ Peritaciones → el coche
+ perito y contacto al encargar · veredicto, notas, informe y daños al volver
erp: Se libera el pago, y luego se confirma que el vendedor cobró
@ Importaciones → el coche → debajo del depósito
+ antes, en Proveedores: el IBAN, el NIF y el correo del vendedor
erp: Se organizan los dos tramos de transporte
@ Transportes → «Nuevo tramo», uno a Zaragoza y otro a casa del cliente
+ transportista, origen, destino, coste y los datos de recogida
erp: Se encarga la gestoría y se matricula
@ Gestoría → «Nuevo trámite»
+ gestoría y tipo de trámite · al volver, las partidas y la matrícula
erp: Se entrega al cliente y se cierra
@ Importaciones → el coche → «La entrega»
+ fecha, dirección, lo que se le da y los kilómetros de salida
:::

Ocho pasos. Lo que sigue es cada uno con su pantalla.

---

## 1 · Entra la solicitud

:::flujo
cliente: Pide el coche desde **Marketplace VO → Importación** y elige garantía
sistema: Nace el expediente en **Pendiente**, con lo que se le dijo que pagara
correo: **Al cliente** — la cifra a depositar y cuándo se libera
erp: Sale en **Importaciones**, columna Pendiente
@ Importaciones → la columna «Pendiente»
:::

No hay nada que hacer todavía: se espera su transferencia.

---

## 2 · Paga el depósito

:::flujo
cliente: Transfiere el importe entero a la cuenta de depósito
sistema: El expediente pasa solo a **Depósito retenido**
sistema: Nace la **peritación** de ese coche, en «Por encargar»
erp: Comprueba que el depósito está dentro y de qué se compone
@ Importaciones → el coche → «El depósito»
:::

> El depósito lleva cuatro cosas y cada una va a un sitio distinto: el coche al
> vendedor alemán, el fee a nosotros, el impuesto a Hacienda y la garantía a su
> proveedor. Solo el fee es ingreso nuestro.

---

## 3 · Preguntar al vendedor y mandar al perito

:::flujo
erp: Preguntarle al vendedor si el coche sigue disponible
@ Importaciones → el coche → «Preguntar al vendedor»
+ nada: el correo se escribe solo, se revisa y se manda
correo: **Al vendedor** — si sigue, y sus datos de pago
erp: Encargar la peritación
@ Peritaciones → el coche → «Encargar»
+ perito, dónde está el coche, contacto y teléfono
correo: **Al perito** — que vaya a verlo, y qué mirar
trabajador: El perito contesta con el día y la hora que le van bien
erp: Apuntar la cita y avisar al vendedor
@ Peritaciones → el coche → «Avisar al vendedor»
+ fecha prevista, hora, y quién va a ir
correo: **Al vendedor** — qué día va alguien y que lo tenga listo
:::

---

## 4 · Lo que vio el perito

:::flujo
trabajador: Va, lo ve y llama
erp: Anotar el veredicto y sus notas
@ Peritaciones → el coche → «Lo que vio»
+ si es el que se anunció o no, y lo que encontró
erp: Adjuntar su informe
@ Peritaciones → el coche → «Lo que vio» → «Adjuntar el informe»
+ el PDF o las fotos que mande
erp: Apuntar los daños, uno a uno, con lo que costaría arreglarlos
@ Peritaciones → el coche → «Los daños que vio»
+ pieza y coste de cada uno; el coste puede quedar en blanco
sistema: Se apunta que **esperamos su factura**, por lo que confirmó
:::

Y aquí se parte el camino:

:::flujo
? ¿Es el coche que se anunció?
rama Sí | Queda visto | El coche queda verificado con su fecha y **se abre la puerta al pago**
rama No | No queda visto | El portero sigue cerrado. Se devuelve el depósito entero
:::

> El informe **no bloquea** nada: el perito llama y su PDF llega al día
> siguiente. Pero sale en **Pendientes** hasta que se adjunta, porque es lo
> único que prueba que alguien fue.

---

## 5 · Soltar el dinero

Son **dos** pasos, y entre ellos hay un día en el que el dinero no es de nadie.

:::flujo
erp: Rellenar los datos del vendedor, si faltan
@ Proveedores → el vendedor
+ IBAN, NIF y correo — sin los tres el ERP no deja pagar
erp: **Liberar el pago al vendedor**
@ Importaciones → el coche → debajo del depósito
+ nada: el botón se enciende solo cuando el coche está visto
sistema: El expediente pasa solo a **Verificado y pagado** y nace el **pedido**
correo: **Al vendedor** — que ya se le ha pagado, y su factura a nombre del cliente
trabajador: El depositario manda la transferencia
erp: **El vendedor ya ha cobrado**
@ Importaciones → el coche → donde pone «el dinero sigue en la cuenta»
+ nada: solo confirmar que salió
:::

> Mientras esté liberado y sin transferir, el expediente lo dice en ámbar. Es el
> último momento en que se puede parar: se puede devolver desde liberado y no
> desde transferido.

---

## 6 · El transporte, en dos tramos

:::flujo
erp: Preguntarle al vendedor dónde y cuándo se recoge
@ Importaciones → el coche → «Recogida»
+ nada: el correo se escribe solo
correo: **Al vendedor** — dónde está el coche exactamente y por quién preguntar
erp: Apuntar lo que conteste
@ Transportes → el tramo → los datos de recogida
+ dirección exacta, día, hora y por quién preguntar
erp: Crear el tramo 1 — de Alemania a Zaragoza
@ Transportes → «Nuevo tramo»
+ transportista, origen, destino y coste acordado
correo: **Al transportista** — la recogida, con las dos puntas
erp: Marcarlo **Entregado** al llegar a Zaragoza
@ Transportes → el tramo → «Entregado»
sistema: Se apunta que **esperamos la factura** de ese tramo
erp: Crear el tramo 2 — de Zaragoza a casa del cliente
@ Transportes → «Nuevo tramo»
+ transportista, origen, destino y coste acordado
:::

> Son dos viajes y no uno porque en Zaragoza se homologa y se prepara. Si se
> apunta como uno solo, el coste sale mal y nadie sabe dónde está el coche esos
> días.

---

## 7 · La gestoría

:::flujo
erp: Encargar el trámite
@ Gestoría → «Nuevo trámite»
+ gestoría, coche, matrícula si la hay, y el tipo de trámite
correo: **A la gestoría** — los papeleos y el impuesto a cuenta
trabajador: La gestoría matricula y manda su presupuesto o su factura
erp: Meter las partidas, una a una
@ Gestoría → el trámite → «Partidas»
+ concepto, importe, y si es nuestro o suplido del cliente
erp: Marcarlo **Resuelto**
@ Gestoría → el trámite → «Resuelto»
+ la matrícula
sistema: Se apunta que **esperamos su factura**
:::

> Las tasas y el impuesto son **suplidos** —dinero del cliente— y los honorarios
> son coste nuestro. Puesto al revés, el margen del coche sale mal.

---

## 8 · Liquidar el impuesto

:::flujo
erp: Escribir lo que ha costado de verdad
@ Gestoría → el trámite → partida «Impuesto de matriculación»
+ el importe real que puso la gestoría
sistema: El expediente enseña la diferencia con lo que se cobró a cuenta
erp: Cobrarla o devolverla
@ Importaciones → el coche → «Liquidación del impuesto»
+ nada: un solo botón, según salga a favor o en contra
:::

> **Sin esto no se puede cerrar la entrega.** Si salió más caro y se entrega sin
> cobrar la diferencia, ese dinero no se recupera: el cliente ya tiene su coche.

---

## 9 · Las facturas que van llegando

:::flujo
erp: Abrir las que esperamos y no han llegado
@ Facturación proveedores → Recibidas → el bloque ámbar de arriba
erp: Pinchar la que ha llegado y completarla
@ Facturación proveedores → la línea ámbar
+ número de factura, fecha y el PDF
erp: Decir cómo se parte
@ Facturación proveedores → Recibidas → columna «Desglose»
+ de dónde viene, la base, y el IVA o la cuota
:::

Tres casos, y los tres salen en una importación:

| Quién la manda | Qué se pone |
|---|---|
| Un proveedor español | base y tipo; el total sale solo |
| El perito o el transportista alemán | régimen **UE**, IVA de la factura **0 %**, y aparte el tipo que nos autorrepercutimos |
| La gestoría | **varios tipos**: se pone la cuota, y base + cuota tienen que sumar el total |

---

## 10 · La entrega

:::flujo
erp: Quedar con el cliente
@ Importaciones → el coche → «La entrega»
+ fecha, dirección y a qué hora
erp: Marcar lo que se le da
@ Importaciones → el coche → «La entrega»
+ permiso, ficha técnica, llaves, factura, COC y libro
erp: Cerrar la entrega
@ Importaciones → el coche → «Firmado y entregado»
+ kilómetros de salida y quién lo entrega
sistema: El expediente pasa a **Entregado** y nace su **IdCar** en el garaje del cliente
sistema: En el panel del cliente, la solicitud salta de «En curso» a **Contratadas**
:::

> Lo de la pestaña es automático: lo decide el paso del expediente y nada más.
> Va a **Contratadas** y no a Finalizadas porque ya es un coche suyo, no una
> visita que pasó. El porqué está en el manual de negocio.

---

## 11 · Y lo que queda después

:::flujo
erp: Emitir la comisión de la garantía, si se vendió una
@ Comisiones → la garantía pendiente
+ nada: el importe sale del catálogo
erp: Pedirle la factura al perito, si no ha llegado
@ Peritaciones → el coche → «Pedir su factura»
erp: Comprobar que no queda ninguna factura sin llegar
@ Facturación proveedores → Recibidas
erp: Y que el coche cuadra
@ Dashboard → Financiera → «Margen por coche»
:::

> El expediente cerrado **sigue diciendo qué le falta**. Un gasto sin factura no
> se deduce, y cerrar la entrega no hace que deje de faltar.

---

## Los ocho correos que salen

Todos se escriben solos, se revisan en pantalla antes de mandarse y se puede
tocar lo que sea.

| Cuándo | A quién | Qué pide |
|---|---|---|
| Con el depósito dentro | Vendedor | Si sigue disponible, y sus datos de pago |
| Con el depósito dentro | Perito | Que vaya a verlo, y qué mirar |
| Con el día que dé el perito | Vendedor | Qué día va alguien, y que lo tenga listo |
| Con la revisión hecha | Perito | Su factura, a nombre de PopCar |
| Al liberar el pago | Vendedor | Que ya se le ha pagado, y su factura |
| Al organizar el tramo | Vendedor | Dónde y cuándo se recoge |
| Con el tramo creado | Transportista | La recogida, con las dos puntas |
| Al entrar en trámites | Gestoría | Los papeleos y el impuesto real |
