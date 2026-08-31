# Comprar un coche, de principio a fin

Cuando PopCar compra un coche —lo traiga de Alemania, lo reserve en un
concesionario, se lo compre a una empresa de renting o a una persona— el camino
es el mismo y pasa por cuatro sitios del ERP:

**Pedidos** → **Transportes** → **Gestoría** → y la entrega, en el expediente del
cliente.

Este manual los recorre en orden. Si buscas solo lo de importación, está en
*Marketplace VO — Importación*.

---

## Lo que cambia según a quién se le compre

No es lo mismo, y el sistema lo sabe: te pide papeles distintos y te abre
trámites distintos.

| | Alemania | Concesionario | Ex-renting | Particular |
|---|---|---|---|---|
| Después hay que | **Matricularlo** | Transferirlo | Transferirlo | Transferirlo |
| Lo caro | Impuesto y transporte | — | — | Impuesto de transmisiones |
| Ojo con | Que falte el COC | Poco | Cargas de la flota | **Cargas y deudas** |

---

## 1 · Pedidos

Un pedido es **encargarle un coche a alguien**. Los de importación se crean
solos al pasar un expediente a «Pedido a Alemania»; el resto se crean con
**Nuevo pedido**, incluso sin cliente detrás —comprar para stock también es un
pedido—.

**Los estados**

| Estado | Qué quiere decir |
|---|---|
| Borrador | Se está preparando; aún no se ha pedido nada |
| Pedido | Se ha encargado al proveedor |
| Confirmado | Lo acepta y da fecha. Aquí se abre su transporte |
| En camino | Ha salido |
| Recibido | Está en nuestras manos. Aquí empieza el papeleo |

Cambiar de estado **pide decir qué ha pasado**, y eso se guarda en las notas con
la fecha delante. No es burocracia: el siguiente que coja el teléfono necesita
saber por qué está donde está.

**Lo que hace falta para pasar de fase**

Cada cosa se pide en el estado que la significa, ni antes ni después. Si falta,
el pedido te lo dice **antes** de que lo intentes y no te deja pasar.

| Para pasar a | Hace falta |
|---|---|
| Pedido | A quién se le encarga. Si es un particular, las cuatro comprobaciones |
| Confirmado | Por cuánto se ha cerrado |
| En camino | Los papeles imprescindibles de su origen |
| Recibido | Kilómetros y llaves |

Un pedido sin proveedor es un coche esperando sin que nadie sepa a quién
reclamar. Sin importe, el coste y el margen de ese coche salen mal desde el
primer día. Y ponerlo en camino es contratar un transporte y pagarlo: sin los
papeles que lo hacen nuestro, lo que se mueve es un coche de otro.

Lo que **no** se pide: papeles para confirmar —llegan en momentos distintos— ni
mirar un coche que todavía no ha llegado. Cancelar no pide nada. Y saltarse
fases no sirve de atajo: llegar a una exige lo de todas las anteriores.

Por la misma razón, **un pedido abierto solo enseña lo de su fase**: los
kilómetros y las llaves aparecen cuando el coche viene de camino, los papeles
cuando ya sirven para moverlo, y el reacondicionado cuando está aquí. Abajo hay
**«Ver todos los datos del pedido»** para lo que haya que corregir fuera de
sitio.

**Los papeles.** Cada pedido enseña lo que falta según de dónde venga: de
Alemania la ficha del vehículo y el COC, de un particular el informe de la DGT y
el recibo del impuesto. En rojo lo que bloquea, en ámbar lo que solo conviene.
Al subir un documento **di qué papel es**: si no, no tapa el hueco.

**Lo que cuesta.** Abajo del pedido está la suma de verdad —proveedor, transporte
y gestoría— y, si ya se vendió, el margen. Y arriba de la pantalla, **Dónde se
gana**: cuál de los cuatro caminos deja dinero.

---

## 2 · Comprarle a una persona

Es el único caso que puede salir mal **sin arreglo**, así que el pedido no sale
de borrador hasta que estén las cuatro:

| Hay que mirar | Si no |
|---|---|
| Informe de la DGT, y limpio | Un coche con carga no se pone a nombre de nadie |
| Que quien firma es el titular | La venta no vale, y ya has pagado |
| Que no debe el impuesto de circulación | Bloquea la transferencia |
| Que la ITV está en vigor | Sin ella no se transfiere |

Cada una guarda **quién la marcó y cuándo**. El día que aparezca un embargo, esa
va a ser la pregunta.

---

## A nombre de quién va el coche

**No es lo mismo que quién lo vende.** PopCar vende siempre —su factura, su
garantía— pero no tiene por qué ser el titular. Ahí está la diferencia entre
pagar un cambio de nombre o dos.

| | A nombre del cliente | A nombre de PopCar |
|---|---|---|
| Coche de aquí | **Una** transferencia, al venderlo | **Dos**: al comprarlo y al venderlo |
| Importación | Se matricula ya a su nombre: **ninguna** | A nuestro nombre, y una al vender |

El pedido lo propone solo: **con cliente detrás, a su nombre**; sin cliente, al
nuestro, porque no hay otro sitio donde ponerlo. Se puede cambiar.

**Si va a nuestro nombre**, al recibirlo empieza a correr el plazo para
revenderlo. Comprar para revender no paga el impuesto de transmisiones **si se
revende dentro de plazo**; pasado, sí, y ese dinero aparece de golpe meses
después sobre un coche que ya no interesa a nadie.

El pedido enseña la fecha límite y avisa **dos meses antes**, que es lo que da
margen para bajarlo de precio en vez de descubrirlo tarde. **Vender el mismo día
del límite está en plazo**: el último día cuenta.

---

## 3 · Transportes

Cada viaje del coche es un **tramo**: del vendedor al almacén, del almacén al
taller, del taller al cliente. Al confirmar un pedido se abre el primero; los
demás los añades tú.

| Estado | Qué quiere decir |
|---|---|
| Por organizar | Nadie ha quedado en recogerlo |
| Contratado | Cerrado con un transportista y a un precio |
| Recogido | Ya lo tiene |
| En tránsito | De camino |
| Entregado | Ha llegado |

**No se puede dar por contratado sin decir quién lo trae y por cuánto.** Sin
precio cerrado, la factura que llegue será la que quieran.

**Las fotos.** Al recoger y al entregar. No te bloquean —un coche que ha llegado
ha llegado— pero el sistema te las echa en falta, porque el día que haya que
reclamar un golpe no habrá manera de conseguirlas. Se suben dentro del propio
transporte.

La pantalla ordena por lo que hay que hacer: primero lo que nadie ha organizado,
después lo que viene de camino, con los días que lleva.

---

## 4 · Al llegar el coche

**Antes de darlo por recibido hay que mirarlo.** El sistema pide dos datos y no
deja pasar sin ellos:

- **Los kilómetros que marca.** Se leen antes de moverlo.
- **Cuántas llaves vienen.** Se cuentan delante de quien lo trae. Una segunda
  llave cuesta cientos de euros, y descubrir que falta el día de la entrega es
  descubrirlo tarde. **Cero llaves es una respuesta**, no un hueco.

Además se anotan daños y observaciones —libro de mantenimiento, ITV, ruedas—.
De ahí sale la ficha honesta del coche para venderlo.

**Si no es lo que se compró**, márcalo y escribe qué se le reclama al proveedor.
Sin la reclamación escrita no se guarda: quien lo lea dentro de un mes tiene que
saber qué se pidió.

---

## 5 · Gestoría

Al pasar el pedido a **Recibido** se abren solos los trámites que tocan:

| De dónde viene | Qué se abre |
|---|---|
| Alemania | Impuesto de matriculación, ITV de homologación, matriculación |
| Concesionario, ex-renting, stock | Transferencia de titularidad |
| Particular | Transferencia **e impuesto de transmisiones** |

Y al marcar una venta como **Vendido**, su transferencia al cliente.

Los llevan gestorías de fuera, así que la pantalla se ordena por eso: **primero
lo que está esperando fuera**, y lo que lleva más días arriba. Pasadas dos
semanas sale en rojo.

**No se manda fuera sin decir a qué gestoría.** Un trámite «enviado» sin gestoría
es un papel que no está en ningún sitio.

El tipo de trámite es **texto libre**: la lista es una ayuda, no un límite. Si
aparece un papeleo nuevo, se escribe y ya.

---

## 6 · La entrega

En el expediente del cliente, dentro de Importaciones. Se marca **delante de él**,
uno a uno: permiso de circulación, ficha técnica, todas las llaves, libro,
factura, contrato y el documento de garantía.

Para cerrarla hacen falta dos cosas: **los kilómetros de salida** y **la firma**.
Que falte un papel no lo impide —a veces la ficha llega después— pero se ve cuál.

Al cerrarla empieza la **garantía**, con su fecha de fin calculada ese día. Si
mañana la política cambia, los coches ya entregados conservan lo que se les
prometió.

---

## Proveedores

Transportistas, gestorías, talleres y vendedores. Se eligen de una lista en el
tramo, en el trámite y en el gasto — y si uno no está, se añade en el momento
sin salir de la pantalla.

Antes se escribían a mano, y el mismo proveedor acababa con tres nombres. Los
que ya estaban se trajeron solos: los nombres se agruparon —«Transportes
Gómez» y «transportes gomez» son uno— y se quedó la primera forma en que
alguien lo tecleó.

Un proveedor puede ser **varias cosas**: hay talleres que también traen coches.

Al abrir uno sale **lo que llevamos con él**: cuántos transportes, cuántos
trámites, cuánto reacondicionado, y el total. Esa es la pregunta que justifica
tener la lista.

Darlo de baja lo quita de las listas, pero **no borra nada**: lo que se le
compró sigue siendo suyo.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Lo que se le ha encargado a un proveedor | **Pedidos** |
| Lo que falta por reunir de un coche | En su pedido, arriba |
| Lo que hay que comprobar de un particular | En su pedido, lo primero |
| Lo que se vio al llegar el coche | En su pedido, «Al llegar» |
| Lo que ha costado y lo que se ha ganado | Abajo del pedido |
| Quién trae cada coche y por cuánto | **Transportes** |
| Con quién trabajamos, y cuánto llevamos | **Proveedores** |
| Las fotos de la recogida y la entrega | Dentro del transporte |
| Los papeleos y en qué gestoría están | **Gestoría** |
| La entrega y la garantía | En el expediente del cliente |
