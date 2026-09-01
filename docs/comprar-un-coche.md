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
solos al pasar un expediente a «Verificado y pagado»; el resto se crean con
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
| En camino | Los papeles imprescindibles de su origen, la factura del vendedor pagada, y un transporte que ya lo haya recogido |
| Recibido | Kilómetros y llaves |

Un pedido sin proveedor es un coche esperando sin que nadie sepa a quién
reclamar. Sin importe, el coste y el margen de ese coche salen mal desde el
primer día.

**En camino** es el que más pide, porque es el momento en que el coche se mueve
de verdad. Sin los papeles que lo hacen nuestro y sin haberlo pagado, lo que
viaja es un coche del vendedor, por nuestra cuenta y a nuestro riesgo. Y hasta
ahora «en camino» era una casilla que se marcaba sola: el pedido decía que el
coche venía sin que existiera ningún transporte. Ahora lo dice quien lo lleva —
un tramo recogido, en tránsito o ya entregado.

El número de la factura del vendedor no es burocracia: es lo que ata el pago a
este coche. Sin él, meses después hay un cargo sin concepto y un coche sin
coste.

Lo que **no** se pide: papeles para confirmar —llegan en momentos distintos— ni
mirar un coche que todavía no ha llegado. Cancelar no pide nada. Y saltarse
fases no sirve de atajo: llegar a una exige lo de todas las anteriores.

Por la misma razón, **un pedido abierto solo enseña lo de su fase**: los
kilómetros y las llaves aparecen cuando el coche viene de camino, los papeles
cuando ya sirven para moverlo, el reacondicionado cuando está aquí, y la
matrícula cuando el coche ya la tiene. Cada campo dice además si hace falta o es
opcional, porque un hueco vacío puesto delante parece una tarea pendiente. Abajo
hay **«Ver todos los datos del pedido»** para lo que haya que corregir fuera de
sitio.

**A nombre de quién va.** Depende de por dónde venga el coche. En **importación**
viene en *El cliente*, porque el coche no es nuestro: lo compra él al
concesionario alemán y nosotros cobramos un fee por traerlo. En los demás
caminos viene en *PopCar*, también cuando hay un cliente esperando, porque ahí sí
compramos para revender, con nuestra factura y nuestra garantía. Con el coche a
nuestro nombre empieza a correr el plazo de reventa, que el pedido enseña al
recibirlo; en importación ese plazo no existe.

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

**No es lo mismo que quién lo vende.** Y quién vende depende del camino:

- En **importación PopCar no vende nada**. El coche lo vende el concesionario
  alemán al cliente y nosotros cobramos un fee por traerlo, así que se matricula
  directamente a su nombre. No hay cambio de nombre que pagar ni plazo de
  reventa que vigilar, porque el coche nunca es nuestro.
- En los **demás caminos** sí compramos para revender: nuestra factura, nuestra
  garantía. Ahí PopCar no tiene por qué ser el titular, y ahí está la diferencia
  entre pagar un cambio de nombre o dos.

| | A nombre del cliente | A nombre de PopCar |
|---|---|---|
| Coche de aquí | **Una** transferencia, al venderlo | **Dos**: al comprarlo y al venderlo |
| Importación | Se matricula ya a su nombre: **ninguna** | No aplica: el coche no es nuestro |

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
taller, del taller al cliente. Los que hacen falta sí o sí se abren solos; los
demás los añades tú.

### Un coche de fuera hace dos viajes, no uno

No puede ir de Alemania a casa del cliente de un tirón: **para en Zaragoza**,
que es donde pasa la ITV de homologación y donde se prepara antes de
matricularse. Así que se abren dos tramos, y cada uno en su momento:

| Tramo | Cuándo se abre | Desde | Hasta |
|---|---|---|---|
| **1 · Traerlo** | Al **confirmar** el pedido | La ciudad alemana de la oferta | Zaragoza |
| **2 · Entregarlo** | Al marcarlo **Recibido** | Zaragoza | La dirección del cliente |

**Zaragoza y no Madrid** por dos razones: ahí está la ITV que homologa, y queda a
media distancia de Madrid, Barcelona, Valencia y Bilbao, que es donde vive la
mayoría de los clientes que no están en el sur.

Ninguna de las direcciones se escribe a mano. La de salida sale de la propia
oferta —la ciudad del vendedor alemán— y la de llegada, de lo que el cliente
dijo en su solicitud o cambió después en su panel, con calle y código postal.

**Los dos viajes van dentro del precio** que se le cobró. Que por dentro sean dos
camiones distintos —o el mismo conductor, si se trae rodando— es cosa nuestra: él
compró un viaje.

El segundo se abre **al recibirlo y no antes** porque hasta ese momento no se
sabe si hay algo que arreglar. Si el cliente todavía no ha dicho dónde quiere
recibirlo, el tramo se abre **sin destino**: se ve que falta, en vez de
inventarse uno.

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

Los tipos son **transportista, gestoría, taller, vendedor, garantías y otro**. El
de garantías no está por completar la lista: un producto de garantía **tiene que**
**colgar de un proveedor dado de alta**, y el ERP no deja guardarlo apuntando a
alguien que no existe o que no está marcado como de garantías.

La razón es la de siempre: el día que haya que reclamar una, lo primero que se
busca es a quién. Un nombre escrito suelto dentro del producto no tiene teléfono,
ni CIF, ni sirve para contestar cuánto llevamos con ellos. Si la garantía la dais
vosotros, se deja sin proveedor.

Al abrir uno sale **lo que llevamos con él**: cuántos transportes, cuántos
trámites, cuánto reacondicionado, y el total. Esa es la pregunta que justifica
tener la lista.

**Las tarifas de un transportista.** Al abrir uno de tipo transportista aparece
su tabla de tarifas: qué cobra por cada corredor —de dónde a dónde— y por
cuántos coches van juntos. El precio es siempre **por coche**.

Una tarifa **sin ciudad vale para todo el país**: «de Alemania a España, 900 €».
Con ciudad vale solo para esa: «de Múnich a Madrid, 850 €». Cuando las dos
sirven, gana la de la ciudad aunque sea más cara — alguien se molestó en cerrar
ese corredor, y eso vale más que un precio general.

Una tarifa **sin ningún precio no se guarda**: dejaría un corredor que parece
cubierto y no lo está, que es peor que no tener nada. Y si le pones fecha de fin,
pasada esa fecha deja de aplicarse: un precio que ya nadie sostiene no sirve para
estimar.

Al contratar un tramo, las tarifas de ese transportista salen al lado del coste
para poder compararlas antes de escribirlo. No se rellena solo: el tramo guarda
«de dónde» y «a dónde» como texto libre, sin país, así que casarlo con un
corredor sería adivinar. La comparación la haces tú, que sabes de qué viaje se
trata.

**Las tarifas de una gestoría** van por trámite, no por corredor, y se guardan en
tres partes: **honorarios**, **tasas de la DGT** y **tasa del colegio**. No es
por gusto: el IVA va sobre los honorarios, y las tasas no lo llevan —son dinero
público que la gestoría adelanta—. Metidas en un solo número, el 21 % se aplicaría
también sobre ellas y el coche saldría más caro de lo que es.

Los nombres de los trámites son **los mismos con los que el ERP abre un**
**expediente**. Si no coinciden, el precio no se casa con el trámite y la tarifa
no sirve para calcular nada; por eso se eligen de una lista en vez de escribirse.

Y el papeleo de un coche sale de sumar **los trámites que le tocan**, que ya los
decide el ERP según de dónde viene y a nombre de quién va. Por eso un coche a
nombre de PopCar cuesta dos cambios de nombre sin que nadie multiplique nada: la
lista trae la transferencia dos veces, una al comprarlo y otra al venderlo.

Lo que **no** tenga tarifa sale aparte, por su nombre, en vez de sumar cero. Un
total al que le falta un trámite y no lo dice es peor que no tener total.

**Buscarlos y sacarlos.** Arriba hay un filtro por tipo, con la opción de todos, y
dos botones para verlos en **cajas** o en **tabla** — la vista elegida se recuerda.

En la tabla, cada columna tiene su propia casilla de filtro. Se aplican todas a la
vez: escribir en dos columnas es acotar más, no cambiar de búsqueda. Y no hace
falta poner tildes — buscar «gestoria» encuentra «Gestorías».

El botón **exportar a CSV** saca lo que estás viendo, con una diferencia: el
fichero lleva **además las notas**, que en la tabla no salen porque ocupan párrafos
y ahí no se leen. En el fichero son justo lo que interesa.

Se exporta **lo que estás viendo**, no el catálogo entero: si filtras por gestorías
y exportas, el fichero trae gestorías. Y el nombre del fichero lleva el filtro y la
fecha, para que dos exportaciones del mismo día no se pisen en Descargas.

**Grupos y filiales.** Un proveedor puede formar parte de un grupo. No se juntan
en una sola ficha —**la factura la emite la filial**, con su CIF— pero al abrir el
grupo, «lo que llevamos con él» **suma también lo de sus filiales**: ese es el
número con el que se negocia. Al abrir una filial sale solo lo suyo, o el mismo
gasto se contaría dos veces.

Solo hay **dos niveles**: grupo y filial. Una filial no puede tener filiales, y un
grupo que ya las tiene no puede pasar a colgar de otro — el desplegable no lo
ofrece, y si se intenta desde fuera se rechaza explicando por qué. Una cadena más
larga dejaría «cuánto llevamos con ellos» sin una respuesta clara.

En la tabla y en el fichero hay una columna de **Grupo**, y se puede filtrar por
ella.

**Lo que se ve al abrir un proveedor**, según lo que sea:

| Si es | Sale |
|---|---|
| Transportista | Sus **tarifas por corredor**, con el precio por coche en cada tramo |
| Gestoría | Sus **tarifas por trámite**, con honorarios, IVA, tasas y el total de cada uno |
| Garantías | Los **productos que da**, con lo que cuesta cada uno al cliente, **lo que nos cuesta a nosotros y lo que deja**, a qué coches se puede ofrecer y qué cubre |

Esos dos últimos números —el coste y el margen— no salen nunca en la oferta del
cliente. Están aquí porque son los que dicen si el producto tiene sentido.

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
