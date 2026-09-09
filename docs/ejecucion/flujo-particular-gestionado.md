# Flujo particular — «Nosotros lo vendemos por ti»

> **Esto todavía no está construido.** Los otros tres manuales cuentan lo que
> hay; este cuenta lo que va a haber. Las pantallas que nombra existen, pero
> casi ninguno de los botones. Está escrito así a propósito: sirve para acordar
> el flujo antes de tocar código, y para que cuando se construya haya un sitio
> donde mirar si falta algo.

Un particular quiere vender su coche y nos encarga la venta entera. Él conserva
el coche y lo único que hace es enseñarlo; lo demás —anuncios, llamadas,
papeles— lo llevamos nosotros. No compramos el coche en ningún momento.

El color dice quién lo hace: azul el cliente, gris lo que pasa solo, morado un
correo que sale, verde algo que se hace en el ERP y amarillo algo que hace una
persona por su cuenta.

La otra opción de **Vender** —publicar él mismo su IDCar en el marketplace— es
un camino distinto y más corto: no hay mandato, ni taller, ni portales, ni
factura. Aquí solo está el gestionado.

---

## De un vistazo

:::flujo
cliente: Elige «Nosotros lo vendemos por ti» y firma el mandato
@ En PopCar, no en el ERP — nos entra en **Leads**
+ sus datos y la firma. Cero euros ahora
erp: El encargo aparece con su cuenta atrás de 30 días
@ IDCars → el coche → «Encargo de venta»
+ nada: entra solo al firmar
cliente: Sube el coche como IDCar y sus papeles
@ IDCars → el coche → «Datos del vehículo» y «Documentos»
+ matrícula, kilómetros, fotos, permiso de circulación, ficha técnica e ITV
cliente: Hace el informe de estado con el móvil
@ IDCars → el coche → «Informe de estado»
+ nada: son fotos guiadas, y de ahí no sale ningún precio
cliente: Elige las franjas en las que puede enseñarlo
@ IDCars → el coche → «Franjas horarias»
+ al menos seis en los próximos catorce días
erp: Se le lleva a un taller de la red, que lo revisa
@ Talleres → «Nueva revisión» → el coche
+ el taller, el día y la hora
erp: Con la revisión hecha, el coche ya tiene sello
@ Peritaciones → la revisión → «Verificado»
+ el grado mecánico, que solo puede poner el taller
erp: Se publica en nuestro marketplace
@ Marketplace → VO Particulares → «Publicar»
+ el precio de salida que se ha acordado con él
trabajador: Y a mano en los portales, con nuestro teléfono
@ Portales → «Nuestros anuncios» → el coche
+ en qué portales se ha puesto y el enlace de cada uno
cliente: Un comprador llega de un portal y pide cita sin registrarse
@ En PopCar, no en el ERP — cae en **Agenda**, como las demás
+ nombre, teléfono, correo y si le interesaría financiarlo
erp: La visita se confirma y se cierra como todas
@ Agenda → la visita → «Confirmar», y después «Fue y se lo quedó»
+ nada: son botones
erp: Si se lo quedó, hay que retirarlo de los portales
@ Portales → «Nuestros anuncios» → el aviso en rojo
+ una casilla por portal; no se cierra hasta que están todas
erp: Y se le factura la gestión al cliente
@ Facturación clientes → «Emitir la factura»
+ nada: 299 €, y se puede cambiar al emitir
erp: Si llega el día 30 sin venderse, se avisa y se retira
@ IDCars → el coche → «Encargo de venta» → «Vence hoy»
+ nada: el correo sale solo. Retirar de los portales sigue siendo a mano
:::

Catorce pasos. Dos pasan fuera del ERP —lo que hace el cliente en PopCar— y uno
es trabajo de persona: poner y quitar los anuncios de los portales.

---

## 1 · El encargo

Lo que se firma no es un pago: es un **mandato de gestión en exclusiva** con
fecha de caducidad. El cliente no adelanta un euro.

:::flujo
cliente: Entra en Vender y elige «Nosotros lo vendemos por ti»
sistema: Se crea el encargo y empieza a contar el plazo
erp: Nos sale como un lead nuevo, con su coche
@ Leads → el lead → «Encargo de venta»
+ nada: llega solo
erp: Y desde ahí se abre la ficha del coche
@ IDCars → el coche
+ nada: se crea al firmar, aunque esté vacía
:::

> **Los tres números del mandato.** 299 € de fee de gestión, que solo se cobra
> si vende con nosotros. 150 € de fee de cancelación, si se sale antes y lo
> vende por su cuenta. Y 30 días de exclusiva. Están así porque los 150 €
> cubren lo que nos hemos gastado en él aunque no venda —92 €— y dejan algo.

> **Exclusiva quiere decir exclusiva.** Mientras dure, el coche no puede estar
> anunciado por él en Wallapop ni en ningún sitio. Esto se puede comprobar:
> rastreamos 800.000 anuncios y se puede buscar su matrícula.

---

## 2 · Las cuatro cosas que tiene que traer

Ninguna es opcional. Mientras falte una, el coche no se publica: en la ficha
salen como una lista con su semáforo, y el botón de publicar no aparece.

:::flujo
cliente: El coche, como IDCar
@ IDCars → el coche → «Datos del vehículo»
+ matrícula, marca, modelo, año, kilómetros y fotos
cliente: Los papeles del coche
@ IDCars → el coche → «Documentos»
+ permiso de circulación, ficha técnica y la última ITV
cliente: El informe de estado
@ IDCars → el coche → «Informe de estado»
+ nada: se abre en el móvil y son fotos guiadas
cliente: Y cuándo puede enseñarlo
@ IDCars → el coche → «Franjas horarias»
+ seis franjas como mínimo, dentro de los próximos catorce días
erp: Desde aquí se ve qué le falta y se le puede reclamar
@ IDCars → el coche → «Encargo de venta»
+ nada: la lista se pinta sola
:::

> **El DNI aquí no se pide.** Hace falta para el contrato y para la
> transferencia, al final del todo. Pedirlo ahora es guardar el DNI de gente
> cuyo coche no se vendió nunca.

> **El informe no tasa el coche.** Enseña los daños sobre un esquema y dice el
> estado aparente. Ni precio, ni horquilla, ni comparación de mercado: eso es
> otra cosa y va por otro lado.

> **Las franjas son suyas, no nuestras.** El que enseña el coche es él, en su
> casa y a su hora. Los huecos de lunes a viernes de nueve a seis que el sistema
> se inventa para los concesionarios aquí no valen: esta persona trabaja.

> **Y se gastan.** Una lista de franjas vacía es un coche que no se puede
> visitar aunque esté publicado. Sale un aviso cuando se acaban.

---

## 3 · El taller, y el sello

Esta es la parte que no puede hacer una foto. La revisión física es lo único que
permite decir algo de la mecánica; sin ella, en el informe la mecánica sale como
«sin datos» y no hay sello.

:::flujo
erp: Se le da cita en un taller de la red
@ Talleres → «Nueva revisión» → el coche
+ el taller, el día y la hora
correo: **Al cliente** — dónde y cuándo tiene que llevarlo
trabajador: El taller lo revisa y devuelve el resultado
erp: Se apunta, y con eso el coche queda verificado
@ Peritaciones → la revisión → «Verificado»
+ el grado mecánico y lo que haya encontrado
sistema: El informe deja de decir «sin datos» en la parte mecánica
erp: Y el coche ya se puede publicar
@ IDCars → el coche → «Encargo de venta»
+ nada: la última luz se pone en verde
:::

> **Se le hace a todos.** También a los que luego no se venden — que son la
> mitad. Ese coste está contado dentro de lo que nos deja cada coche captado, y
> es lo que cubre el fee de cancelación.

> **El sello es lo que nos diferencia.** Un anuncio sin él es un anuncio más
> entre los de Milanuncios. Por eso va antes de publicar y no cuando aparece un
> comprador.

---

## 4 · Se publica

En nuestro marketplace es un botón. En los portales es una persona.

:::flujo
erp: Se acuerda el precio de salida con el cliente
@ Marketplace → Análisis VO → el coche
+ nada aquí: se mira el mercado y se le llama
erp: Se publica en nuestro marketplace
@ Marketplace → VO Particulares → «Publicar»
+ el precio acordado
trabajador: Se pone a mano en los portales
@ Portales → «Nuestros anuncios» → «Añadir publicación»
+ el portal, el enlace del anuncio y la fecha
:::

> **El teléfono de los anuncios es el 684 717 736**, nunca el del cliente. Que
> no le llamen a él es la mitad de lo que nos está pagando.

> **Y en el texto va siempre esta línea:** «Informe de estado y cita en
> popcar.es/v/MATRÍCULA». Es la única forma de que alguien entre solo, sin
> llamar.

> **El anuncio tiene que decir que el vendedor es un particular** y que nosotros
> solo gestionamos la venta. Publicarlo desde una cuenta profesional sin decirlo
> lo hace parecer una venta profesional, y eso arrastra doce meses de garantía
> legal que nadie ha querido dar.

> **Apuntar dónde se ha publicado no es burocracia.** Es la lista con la que
> después hay que retirarlo. Un portal que no está apuntado es un anuncio que se
> queda vivo con nuestro teléfono debajo.

---

## 5 · El comprador que viene de fuera

No controlamos el canal del portal: el comprador ve un teléfono y un formulario,
y eso cae en nuestro teléfono o en nuestro buzón. Así que hay una sola página y
tres maneras de llegar a ella.

:::flujo
cliente: Ve el anuncio en el portal y entra por el enlace
sistema: Abre la ficha pública del coche, con el informe y las franjas
cliente: O llama al teléfono del anuncio, que es el nuestro
trabajador: Se le pregunta lo básico y se le manda el enlace
@ Agenda → «Nueva cita a mano»
+ nombre, teléfono y de qué portal viene
cliente: Elige franja y pide la cita, sin cuenta y sin registrarse
@ En PopCar, no en el ERP — cae en **Agenda** como todas
+ nombre, teléfono, correo y la casilla de financiación
erp: Nos entra pendiente de confirmar, con el portal del que viene
@ Agenda → «visitas por confirmar»
+ nada: entra sola
:::

> **Sin cuenta.** Hoy, para pedir cita hay que estar registrado. Alguien que
> llega de coches.net no se va a hacer una cuenta para ver tres huecos. Es el
> cambio más pequeño de todo este manual y el que más gente deja pasar.

> **La casilla de financiación es una sola pregunta:** «¿te interesaría
> financiarlo?», sí o no. Nada de datos económicos para ver un coche. Al que
> diga que sí se le manda después a la plataforma de scoring.

> **De qué portal viene se apunta siempre.** Es lo que dentro de tres meses
> contesta qué portal merece la pena pagar. Sin eso, los cuatro cuestan lo mismo
> y no se sabe cuál sobra.

---

## 6 · La visita

A partir de aquí es el mismo camino que el de concesionario, con una diferencia:
al vendedor sí le podemos escribir, porque es cliente nuestro y tenemos su
correo.

:::flujo
erp: Se confirma la visita
@ Agenda → la visita → «Confirmar»
+ dónde es y por quién preguntar
correo: **Al comprador y al vendedor** — con el calendario
cliente: Se ven, y el cliente enseña su coche
erp: Cuando pasa el día, se dice cómo acabó
@ Agenda → «visitas por cerrar»
+ nada: «No fue», «Fue a verlo» o «Fue y se lo quedó»
correo: **Al comprador** — qué tal fue, con los tres botones
:::

> El vendedor es el cliente particular, no un comercial nuestro. Nosotros no
> vamos a la visita.

---

## 7 · Si se vende

«Fue y se lo quedó» dispara tres cosas, y una de ellas hay que hacerla a mano.

:::flujo
erp: El coche se retira de nuestro marketplace
@ Marketplace → VO Particulares → el coche
+ nada: se despublica solo al cerrar la visita
erp: Y sale el aviso de retirarlo de los portales
@ Portales → «Nuestros anuncios» → el aviso en rojo
+ una casilla por portal, y no se cierra hasta que están todas
erp: Los papeles y la transferencia
@ Gestoría → el expediente → «Transferencia»
+ ahora sí: el DNI de los dos y el contrato firmado
erp: Y la factura de la gestión al cliente
@ Facturación clientes → «Emitir la factura»
+ nada: 299 €, y se puede cambiar al emitir
:::

> **El aviso de los portales es rojo y no se va solo.** Con el Kia Sorento pasó
> que se entregó el 1 de septiembre y una semana después seguía publicado — y
> eso era en nuestro escaparate, donde se arregla con una consulta. Aquí son
> cuatro sitios que no controlamos, con nuestro teléfono debajo.

> **La venta no acaba aquí.** Si el comprador marcó la casilla de financiación,
> hay una segunda operación con él, y ahí está la mitad del dinero de todo esto.
> Ese trozo todavía no está diseñado.

---

## 8 · Si no se vende: el día 30

:::flujo
sistema: Llega el día 30 y el mandato vence
correo: **Al cliente** — que el coche se va a despublicar
erp: El coche se retira de nuestro marketplace
@ Marketplace → VO Particulares → el coche
+ nada: se despublica solo
erp: Y otra vez el aviso de los portales
@ Portales → «Nuestros anuncios» → el aviso en rojo
+ una casilla por portal
erp: El encargo queda cerrado y sin cobrar
@ IDCars → el coche → «Encargo de venta» → «Vencido»
+ nada
:::

> **Esta es la rama que cuesta dinero.** Uno de cada cinco encargos acaba así:
> no vende, no cancela, no paga, y nos ha costado 92 €. Cada punto que se le
> quite a ese quinto son 92 € que no se pierden — y por eso avisar unos días
> antes de que venza, para que pueda renovar, seguramente valga más que el
> correo del día 30.

---

## Lo que el sistema no hace

| No hace | Lo hace una persona |
|---|---|
| Publicar en coches.net, Milanuncios, Wallapop o AutoScout | Poner cada anuncio a mano y apuntarlo |
| Retirarlos cuando el coche se vende o vence el plazo | Marcar las casillas del aviso rojo |
| Contestar el teléfono del anuncio | Cualificar al comprador y mandarle el enlace |
| Decidir el precio de salida | Mirar el mercado y acordarlo con el cliente |
| Saber si el cliente ha puesto el coche por su cuenta | Buscar su matrícula en los portales rastreados |
| Vender la financiación al comprador | Llamarle. Es una hora por operación y no se automatiza |

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Los encargos vivos y su cuenta atrás | **IDCars**, con filtro «gestionados por nosotros» |
| Qué le falta a un cliente por traer | **IDCars** → el coche → «Encargo de venta» |
| Los que vencen esta semana | **Dashboard** → Pendientes |
| Los que se quedaron sin franjas | **Dashboard** → Pendientes |
| Las revisiones de taller pendientes | **Talleres** |
| El grado mecánico y el sello | **Peritaciones** → la revisión |
| Dónde está publicado cada coche | **Portales** → «Nuestros anuncios» |
| Los que hay que retirar de los portales | **Portales**, el aviso en rojo |
| Las visitas, como siempre | **Agenda** |
| De qué portal vino cada comprador | **Agenda** → la visita → el origen |
| Las gestiones sin facturar | **Facturación clientes** |
| El contrato y la transferencia | **Gestoría** → el expediente |

## Lo que falta por decidir

| Qué | De quién depende |
|---|---|
| Si al que agota los 30 días se le cobra algo o no | Ana |
| Qué plataforma externa hace el scoring del comprador | Ana la tiene que pasar |
| Si la revisión de taller cuesta de verdad 60 € | Validar con talleres. Si son 120, el fee de cancelación de 150 € ya no cubre el coste hundido |
| Cuánto cuesta cada anuncio profesional en cada portal | Tiene que caber dentro de los 299 € |
| Qué pasa con el comprador financiado después de comprar | Sin diseñar. Es la mitad del ingreso |
