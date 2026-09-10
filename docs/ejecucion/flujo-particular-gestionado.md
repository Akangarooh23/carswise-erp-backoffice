# Flujo particular — «Nosotros lo vendemos por ti»

Un particular quiere vender su coche y nos encarga la venta entera. Él conserva
el coche y lo único que hace es enseñarlo; lo demás —precio, anuncio, llamadas,
citas, papeles— lo llevamos nosotros. No compramos el coche en ningún momento.

El color dice quién lo hace: azul el cliente, gris lo que pasa solo, morado un
correo que sale, verde algo que se hace en el ERP y amarillo algo que hace una
persona por su cuenta.

> **Qué está construido y qué no.** Todo lo de este manual funciona menos una
> cosa, marcada donde toca: **los anuncios en portales**, que se ponen y se
> quitan a mano sin que el ERP lo sepa. Lo demás se puede recorrer entero.

La otra opción de **Vender** —publicar él mismo su IDCar en el marketplace— es
un camino distinto y más corto: no hay mandato, ni taller, ni portales, ni
factura. Aquí solo está el gestionado.

---

## De un vistazo

:::flujo
cliente: Pide en la web que le vendamos su coche
@ En PopCar, no en el ERP — cae en **Leads** como «Vender su coche»
+ qué coche, en cuánto tiempo, nombre, teléfono y correo
erp: Se le llama y se le abre el encargo sobre su coche
@ Leads → el lead → «Encargo de venta» → «Abrir encargo»
+ nada: se pulsa sobre el coche que él eligió
erp: Se le manda el mandato y se apunta cuándo lo firma
@ IDCars → el coche → «Encargo de venta» → «Mandato»
+ la fecha de la firma y cómo nos consta
erp: Se acuerda el precio y si firma la cláusula
@ IDCars → el coche → «Encargo de venta»
+ el precio que le proponemos y la casilla de la cláusula
cliente: Se hace la tasación gratuita
@ En PopCar, no en el ERP — sale en **IDCars** cuando está hecha
+ nada: es un cuestionario, y de ahí sale el precio
cliente: Sube el coche, sus papeles y el informe de estado
@ IDCars → el coche → «Datos del vehículo» y «Documentos»
+ matrícula, kilómetros, fotos, permiso, ficha técnica e ITV
cliente: Y elige las franjas en las que puede enseñarlo
@ IDCars → el coche → «Franjas horarias»
+ al menos seis en los próximos catorce días
erp: Con las cinco puertas abiertas, se le lleva al taller
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller»
+ a qué taller se lleva, y después lo que dijeron
erp: Se publica en nuestro marketplace
@ Marketplace → VO Particulares → «Publicar»
+ el precio de salida que se ha acordado con él
trabajador: Y a mano en el portal, con nuestro teléfono
@ Portales → el portal donde se publique
+ el anuncio, con el enlace corto y el 684 717 736
cliente: Un comprador llega del portal y pide cita sin registrarse
@ En PopCar, no en el ERP — cae en **Agenda** como todas
+ nombre, teléfono, correo y si le interesaría financiarlo
sistema: Hasta que no pulsa el enlace del correo, no hay reserva
@ Agenda → la visita aparece cuando la confirma
+ nada: el hueco sigue libre mientras tanto
erp: La visita se confirma y se cierra como todas
@ Agenda → la visita → «Confirmar», y después «Fue y se lo quedó»
+ nada: son botones
erp: Se cierra el encargo y se factura lo que toque
@ IDCars → el coche → «Cerrar el encargo»
+ nada: son tres botones y cada uno dice cuánto se le factura
:::

Catorce pasos. Cinco los hace el cliente, dos pasan fuera del ERP y uno es
trabajo de persona: poner y quitar el anuncio del portal.

---

## 1 · Del lead al encargo

Lo que se firma no es un pago: es un **mandato de gestión de venta**. El cliente
no adelanta un euro.

:::flujo
cliente: Rellena el formulario de «Nosotros lo vendemos por ti»
sistema: Entra como lead de tipo «Vender su coche»
correo: **Al cliente** — que le llamamos en menos de 24 horas laborables
erp: Sale en la lista, y a las 24 horas laborables, en Pendientes
@ Leads → «Solicitudes»
+ nada: llega solo
trabajador: Se le llama. Es la promesa de la web y no la hace el sistema
erp: Y se le abre el encargo sobre su coche
@ Leads → el lead → «Encargo de venta»
+ nada: se pulsa el botón del coche
:::

> **Las 24 horas son laborables, y tienen su propia línea en Pendientes.** Un
> formulario que entra el viernes por la tarde no está tarde el sábado; el lunes
> por la mañana, tampoco. Cuando el plazo se pasa, ese lead sale de «leads sin
> contestar» —cuyo criterio son tres días— y aparece en rojo como «encargos de
> venta sin llamar». No se cuenta dos veces: sale de un sitio y entra en otro.

> **Qué coche es lo dice él, no lo adivinamos.** Si al rellenar el formulario
> había entrado, eligió el coche de una lista con los suyos, y en el lead sale
> el primero, en negrita y con «← el que eligió». Si lo escribió a mano —porque
> no había entrado— el bloque lo dice: «lo puso a mano, confírmale cuál de estos
> es». Con un coche se adivina; con tres, no.

> **Si no tiene ningún coche dado de alta**, el bloque lo dice y no hay botón que
> pulsar: el IDCar lo crea él, porque es quien tiene las fotos y los papeles. En
> la llamada, lo que hay que pedirle es eso.

> **El mandato no caduca.** Se extiende hasta que él lo cancela o hasta que
> vendemos. Los 30 días de los que se habla más abajo no son una caducidad: son
> hasta cuándo se le puede cobrar la cancelación.

---

## 1b · El mandato firmado

Abrir el encargo no es firmarlo. El mandato es el papel donde el cliente acepta
el trato, y es **lo único que nos deja cobrarle**: sin él no se le factura nada,
ni los 299 € si el coche se vende ni los 150 € si se va.

:::flujo
erp: Se descarga el mandato, hecho con lo que hay en el encargo
@ IDCars → el coche → «Encargo de venta» → «Descargar»
+ nada: sale con su número, el coche, el precio y las condiciones
trabajador: Se le manda, lo firma y lo devuelve
erp: Se apunta cuándo lo firmó y cómo nos consta
@ IDCars → el coche → «Encargo de venta» → «Ya lo ha firmado»
+ la fecha, una de las tres maneras, y dónde está el papel
:::

> **Hacen falta las dos cosas: la fecha y el cómo.** Una fecha sola es
> exactamente lo que había antes —un dato que el ERP se escribía a sí mismo al
> pulsar un botón— y con eso no hay nada que enseñar el día que alguien discuta
> una factura. Las tres maneras son: lo firmó delante de nosotros, nos mandó el
> papel firmado, o lo aceptó por correo.

> **El plazo de los 30 días empieza en la fecha de la firma**, no al abrir el
> encargo ni el día que se apunta. Si se le apunta tres semanas tarde, le quedan
> diez días, no treinta.

> **El documento no se guarda, se genera cada vez** con lo que hay en el
> encargo. Guardando una copia, el día que se acuerde otro precio habría dos
> papeles distintos y el que el cliente tiene delante no sería el que dice el
> ERP. Lo que sí queda guardado es cuál firmó: su número y la fecha.

> **Mientras no esté firmado sale en Pendientes**, en rojo. Ese coche se puede
> anunciar y se puede vender igual — lo que no se puede es cobrarlo, y cuanto
> más tarde se pida la firma más raro es pedirla.

---

## 2 · El precio, y si lo acepta

El precio no se lo inventa nadie: sale de la **tasación gratuita** que se hace
el cliente. Se le propone ese número y él lo acepta firmando la cláusula, o no.

:::flujo
cliente: Se hace la tasación gratuita de su coche
@ En PopCar, no en el ERP — llega a **IDCars**, en el encargo
+ nada: un cuestionario, y sale un importe
erp: El campo del precio arranca con lo que dio su tasación
@ IDCars → el coche → «Encargo de venta» → «Precio que le proponemos»
+ el precio, si se acuerda otro distinto
erp: Y se marca si ha firmado la cláusula del precio
@ IDCars → el coche → «Encargo de venta»
+ una casilla, y se guarda
:::

> **Es lo que decide la penalización**, así que no es un detalle administrativo:

| Situación | ¿Paga los 150 €? |
|---|---|
| Firmó la cláusula · se va antes de 30 días | **Sí** |
| Firmó la cláusula · se va después de 30 días | **No** |
| No firmó la cláusula · no vende con nosotros | **Sí, siempre y desde el día 1** |

> **Los 30 días cuentan desde que firmó**, no desde que se marca la casilla. Si
> se le apunta tres semanas después, le quedan diez días, no treinta.

> **Por defecto nace en «no aceptó».** Es la respuesta prudente: da por hecho que
> se le puede cobrar, y eso lo corrige el cliente en cuanto pase. Al revés se
> dejaría de cobrar sin que nadie se entere.

---

## 3 · Las cinco puertas

Ninguna es opcional. Mientras falte una, el coche no se publica: salen como una
lista con su semáforo, y el botón de publicar no deja.

Estas cinco son **cosas suyas**. Hay una sexta que ponemos nosotros —la revisión
del taller, en el apartado siguiente—, y por eso van separadas: cuando se le
llama, lo que se le pide es esto y nada más.

:::flujo
cliente: El coche, como IDCar
@ IDCars → el coche → «Datos del vehículo»
+ matrícula, marca, modelo, año, kilómetros y seis fotos
cliente: Los papeles del coche
@ IDCars → el coche → «Documentos»
+ permiso de circulación, ficha técnica y la última ITV
cliente: La tasación gratuita
@ IDCars → el coche → «Encargo de venta»
+ nada: se la hace él desde su panel
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
> estado aparente. Ni precio, ni horquilla: eso es la tasación y va por otro
> lado.

> **Las franjas son suyas, no nuestras.** El que enseña el coche es él, en su
> casa y a su hora.

> **Y se gastan.** Según se reservan, esa puerta se vuelve a cerrar sola y sale
> el aviso de «encargos sin horas para visitar»: un anuncio vivo que nadie puede
> visitar paga el anuncio y no convierte a nadie.

---

## 4 · El taller, y el sello

Es la parte que no puede hacer una foto. La revisión física es lo único que
permite decir algo de la mecánica.

:::flujo
erp: Se le da cita en un taller de la red
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller»
+ a qué taller se lleva y qué día
trabajador: Se le llama al cliente para decirle dónde y cuándo
erp: Se apunta lo que dijo el taller
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller»
+ lo que encontraron, y cuál de los tres resultados
:::

> **Es la sexta puerta, y la única nuestra.** Las cinco anteriores son cosas del
> cliente; esta la ponemos nosotros. Mientras no esté hecha, el botón de
> publicar sale apagado y el servidor tampoco deja: un anuncio nuestro dice que
> el coche está comprobado, y eso no lo puede sostener una foto.

> **Tres resultados, y solo uno cierra la puerta.** «Bien» y «se puede vender,
> contando lo que tiene» dejan publicar —la mayoría de los coches de diez años
> caen en el segundo—. «No se puede vender así» no deja, y ese coche sale en
> Pendientes: su dueño tiene un encargo firmado y hay que llamarle.

> **Se le hace a todos**, también a los que luego no se venden. Cuesta 60 € —el
> precio de Norauto— y ese gasto es nuestro: es lo que cubre el fee de
> cancelación.

> **La garantía mecánica no es esto.** Es un producto aparte que el cliente
> contrata o no, y **no define el sello**. Lo que hace que el coche esté
> comprobado es la revisión del taller.

---

## 5 · Se publica

En nuestro marketplace es un botón. En el portal es una persona.

:::flujo
erp: Se publica en nuestro marketplace
@ Marketplace → VO Particulares → «Publicar»
+ el precio acordado
trabajador: Y se pone a mano en el portal
@ Portales → el portal donde se publique
+ el texto del anuncio y su enlace, para poder retirarlo
:::

> **No se publica si falta una puerta.** El botón sale apagado, pero la
> comprobación de verdad está en el servidor y antes de escribir nada: la
> promesa de que un anuncio nuestro lleva informe y se puede visitar tiene que
> sostenerse venga la llamada de donde venga.

> **El teléfono de los anuncios es el 684 717 736**, nunca el del cliente. Que no
> le llamen a él es la mitad de lo que está pagando.

> **En el texto va siempre `popcar.es/v/MATRÍCULA`.** En los portales no se puede
> enlazar: solo cabe una línea de texto que alguien teclea. Esa dirección lleva
> a la ficha del coche, y da igual cómo escriba la matrícula —con espacios, con
> guion o en minúscula—. Si el coche ya se vendió, no da error: dice que ya no
> está a la venta y enseña otros.

> **Es un portal, no cuatro.** Cuesta entre 20 y 30 € al mes según cuál.

> **El anuncio tiene que decir que el vendedor es un particular** y que nosotros
> solo gestionamos la venta. La garantía legal la da quien vende y es propietario
> del bien, y nosotros no lo somos en ningún momento — pero decirlo en el anuncio
> cierra la discusión antes de que empiece.

> **Retirar el anuncio del portal es a mano y nadie lo vigila.** Es lo que pasó
> con el Kia Sorento, pero en un canal que no controlamos y con nuestro teléfono
> debajo. Lo que falta para arreglarlo está escrito y probado; falta enchufarlo.

---

## 6 · El comprador que viene de fuera

No controlamos el canal del portal: el comprador ve un teléfono y un enlace. Así
que hay una sola página y dos maneras de llegar a ella.

:::flujo
cliente: Ve el anuncio y entra por `popcar.es/v/MATRÍCULA`
sistema: Abre la ficha del coche, con el informe y las franjas
cliente: O llama al teléfono del anuncio, que es el nuestro
trabajador: Se le pregunta lo básico y se le manda el enlace
@ Agenda → la visita, cuando la pida
+ nada: la pide él desde la ficha
cliente: Elige franja y pide la cita **sin cuenta y sin registrarse**
correo: **Al comprador** — un enlace para confirmar que ese correo es suyo
cliente: Pulsa el enlace y entonces sí se reserva
@ En PopCar, no en el ERP — cae en **Agenda** como todas
+ nombre, teléfono, correo y la casilla de financiación
erp: Nos entra pendiente de confirmar
@ Agenda → «visitas por confirmar»
+ nada: entra sola
:::

> **Sin cuenta, pero no sin comprobar.** Pedir cita sin registrarse era el único
> modo de que alguien de coches.net llegara a algo. Pero la sesión estaba ahí por
> algo: sin ella, cualquiera podía reservar a nombre de otro. El enlace del
> correo prueba lo mismo que probaba la cuenta.

> **El hueco no se aparta hasta que pulsa.** Gana quien confirma primero. Al que
> llega tarde se le dice y se le manda a elegir otra hora, que es preferible a
> que seis peticiones falsas dejen el coche sin franjas.

> **La casilla de financiación es una sola pregunta**, sí o no. Nada de datos
> económicos para ver un coche. Al que diga que sí se le manda después a la
> plataforma de la entidad — que está **por definir**.

---

## 7 · La visita

A partir de aquí es el mismo camino que el de concesionario, con una diferencia:
al vendedor sí le podemos escribir, porque es cliente nuestro.

:::flujo
erp: Se confirma la visita
@ Agenda → la visita → «Confirmar»
+ dónde es y por quién preguntar
correo: **Al comprador y al vendedor** — con el calendario
cliente: Se ven, y el cliente enseña su coche
erp: Cuando pasa el día, se dice cómo acabó
@ Agenda → «visitas por cerrar»
+ nada: «No fue», «Fue a verlo» o «Fue y se lo quedó»
:::

> El vendedor es el cliente particular, no un comercial nuestro. Nosotros no
> vamos a la visita.

---

## 8 · Cerrar el encargo

Un encargo no se acaba solo. Se cierra a mano, con uno de estos tres finales, y
cada uno dice **antes de pulsar** cuánto se le factura.

:::flujo
erp: Se cierra desde la ficha del coche
@ IDCars → el coche → «Encargo de venta» → «Cerrar el encargo»
+ nada: son tres botones con su importe
sistema: Se emite la factura y el encargo queda cerrado
erp: Y la factura queda en su sitio
@ Facturación clientes
+ nada: sale sola, con el concepto puesto
:::

| Cómo acabó | Qué se le factura |
|---|---|
| **Vendido con nosotros** | 299 € de gestión, con el IVA incluido |
| **Se fue sin vender** | Lo que diga la penalización: 150 € o nada |
| **Lo retiramos nosotros** | Nada. Cobrarle sería cobrarle por una decisión nuestra |

> **Cuando una visita acaba en «Fue y se lo quedó»**, ese coche sale en
> Pendientes como «vendido sin cerrar el encargo». Es lo que evita que se
> olviden los 299 €.

> **No se deshace.** Cerrar emite una factura a un cliente, así que va detrás de
> un clic y no como tres botones a la vista.

> **Y sigue faltando retirarlo del portal**, que no lo hace nadie por ti.

---

## Lo que el sistema no hace

| No hace | Lo hace una persona |
|---|---|
| Llamar al cliente en 24 horas, que es lo que promete la web | Llamarle. El ERP solo avisa cuando el plazo ya se ha pasado |
| Publicar en el portal, ni retirarlo cuando se vende | Ponerlo y quitarlo a mano, y apuntar dónde |
| Llevar el coche al taller | Llevarlo. El resultado se apunta en el encargo |
| Contestar el teléfono del anuncio | Cualificar al comprador y mandarle el enlace |
| Conseguir la firma del mandato | Mandárselo y recogerlo firmado |
| Cerrar el encargo | Elegir cómo acabó |
| Vender la financiación al comprador | Llamarle. Una hora por operación, y no se automatiza |

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Los que piden que les vendamos el coche | **Leads**, tipo «Vender su coche» |
| Abrirle el encargo | **Leads** → el lead → «Encargo de venta» |
| Qué le falta por traer | **IDCars** → el coche → «Encargo de venta» |
| El precio y la cláusula | **IDCars** → el coche → «Encargo de venta» |
| Los que están a punto de poder irse | **Dashboard** → Pendientes |
| Los que se quedaron sin franjas | **Dashboard** → Pendientes |
| Los vendidos sin cerrar el encargo | **Dashboard** → Pendientes |
| Las visitas | **Agenda** |
| Cerrar y facturar | **IDCars** → el coche → «Cerrar el encargo» |
| La factura que sale | **Facturación clientes** |

## Lo que falta por decidir

| Qué | De quién depende |
|---|---|
| Con qué entidad financiera y **cómo nos llega si la aprueban** | Sin eso no se puede facturar la comisión, que es la línea de ingreso más grande |
| En qué portal se publica, y con qué cuenta | Es uno, a 20-30 € al mes |
| Si al que agota el plazo se le cobra algo | Ana |
| Qué pasa con el comprador financiado después de comprar | Sin diseñar |
