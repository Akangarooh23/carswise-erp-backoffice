# Flujo particular — «Nosotros lo vendemos por ti»

Un particular quiere vender su coche y nos encarga la venta entera. Él conserva
el coche y lo único que hace es enseñarlo; lo demás —precio, anuncio, llamadas,
citas, papeles— lo llevamos nosotros. No compramos el coche en ningún momento.

El color dice quién lo hace: azul el cliente, gris lo que pasa solo, morado un
correo que sale, verde algo que se hace en el ERP y amarillo algo que hace una
persona por su cuenta.

> **Qué está construido y qué no.** Todo lo de este manual funciona. Poner y
> quitar el anuncio del portal lo sigue haciendo una persona —eso no se
> automatiza—, pero el ERP ya sabe dónde está cada coche anunciado y avisa
> cuando hay que ir a quitarlo.

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
erp: Se le manda el mandato
@ IDCars → el coche → «Encargo de venta» → «Mandárselo»
+ nada: sale con su número, el coche y las condiciones
cliente: Lo firma y lo sube desde su panel
@ En PopCar, no en el ERP — el encargo queda firmado solo en **IDCars**
+ el papel firmado, en PDF, Word o una foto
erp: Se le propone el precio, que arranca con su tasación
@ IDCars → el coche → «Encargo de venta» → «Precio que le proponemos»
+ el precio, y se le da a Guardar
cliente: Sube el coche, sus papeles, el seguro, el mantenimiento y el informe
@ En PopCar, no en el ERP — cada cosa se ve hecha en **IDCars**
+ matrícula, kilómetros, fotos, permiso, ficha técnica, ITV, seguro y facturas
cliente: Y elige las franjas en las que puede enseñarlo
@ En PopCar, no en el ERP — cuentan en **IDCars**, en el encargo
+ al menos seis en los próximos catorce días
erp: Con todo lo suyo hecho, se le da cita en el taller y se le manda
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller»
+ taller, dirección, día y hora; y «Enviársela al cliente»
erp: Cuando el taller contesta, se apunta cómo salió
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller»
+ lo que dijeron, y uno de los tres resultados
erp: Y se le manda el precio de salida para que lo firme
@ IDCars → el coche → «Encargo de venta» → «Mandarle el precio»
+ nada: el precio tiene que estar guardado
erp: Se publica en nuestro marketplace
@ IDCars → el coche → «Publicar en Marketplace»
+ nada: el precio y el título salen solos del encargo y del coche
correo: **Al cliente** — su coche ya está anunciado, con el enlace
@ Sale solo, en cuanto se publica desde **IDCars**
trabajador: Y a mano en el portal, con nuestro teléfono
@ IDCars → el coche → «Encargo de venta» → «Anuncios en portales»
+ el enlace del anuncio; el corto se copia de ahí, con su UTM
cliente: Un comprador llega del portal y pide cita
@ En PopCar, no en el ERP — cae en **Agenda** como todas
+ nombre, teléfono, correo y si le interesaría financiarlo
erp: Si dijo que quiere financiar, sale en Pendientes para llamarle
@ Agenda → la visita → «quiere financiar · marcar llamado»
+ nada: se pulsa cuando ya se le ha llamado
cliente: El vendedor la confirma o propone otra hora, desde su correo
@ En PopCar, no en el ERP — sale en **Agenda** como «esperando al vendedor»
+ dónde es la visita, u otras horas para elegir
erp: Y cuando pasa el día, se dice cómo acabó
@ Agenda → «visitas por cerrar» → «Fue y se lo quedó»
+ nada: son botones
erp: Se cierra el encargo y se factura lo que toque
@ IDCars → el coche → «Cerrar el encargo»
+ nada: son tres botones y cada uno dice cuánto se le factura
correo: **Al cliente** — cómo acabó y qué se le factura, o que no se le cobra
@ Sale solo, en cuanto se cierra desde **IDCars**
:::

El orden no es de estilo: **mandato → lo suyo → taller → precio firmado →
anuncio**. Sin mandato, sin sus siete puertas, sin taller o sin el precio
firmado no se publica. El precio va después del taller porque se fija con lo
que diga. Y los 30 días del trato empiezan al publicar, no al firmar.

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
> por la mañana, tampoco. Cuando el plazo se pasa, ese lead aparece en rojo como
> «encargos de venta sin llamar».
>
> **No se cuenta dos veces.** Las listas de leads excluyen por tipo a los de
> venta gestionada, porque a ellos se les promete otra cosa: si entraran, el
> mismo señor tendría dos avisos con dos plazos distintos.

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
erp: Se le manda el mandato, hecho con lo que hay en el encargo
@ IDCars → el coche → «Encargo de venta» → «Mandárselo»
+ nada: sale con su número, el coche, el precio y las condiciones
correo: **Al cliente** — el mandato adjunto y el trato en tres líneas
cliente: Lo firma y lo sube desde **Mis solicitudes**
sistema: El encargo queda firmado solo, con la fecha y el papel guardado
erp: Si lo firmó por otra vía, se apunta a mano
@ IDCars → el coche → «Encargo de venta» → «Ya lo ha firmado»
+ la fecha, una de las tres maneras, y dónde está el papel
:::

> **Lo normal es que lo suba él, y entonces no hay que marcar nada.** El correo
> le dice que lo firme y lo suba en **Mis solicitudes**. En cuanto lo sube, el
> encargo queda firmado solo, con la fecha de ese momento, y el documento
> guardado en su ficha.
>
> Antes se le pedía que contestara al correo con el papel. Entonces el papel se
> quedaba en una bandeja de entrada y alguien tenía que acordarse de marcarlo a
> mano: mientras tanto el encargo decía «sin firmar» **con el papel firmado ya en
> nuestro poder**, y sin mandato firmado no se le puede facturar nada.

> **Hacen falta las dos cosas: la fecha y el cómo.** Una fecha sola es
> exactamente lo que había antes —un dato que el ERP se escribía a sí mismo al
> pulsar un botón— y con eso no hay nada que enseñar el día que alguien discuta
> una factura.
>
> Las cuatro maneras son: **lo subió firmado a su panel** —la buena, porque es la
> única con papel detrás—, lo firmó delante de nosotros, nos mandó el papel
> firmado, o lo aceptó por correo. Las tres últimas se marcan a mano desde aquí;
> **la primera no se puede marcar**, llega sola cuando lo sube. Marcarla sería
> decir que hay un documento que no está.

> **El plazo de los 30 días no empieza al firmar, sino al publicar.** Hasta que
> el coche está anunciado no hemos empezado a venderlo, y un mes que se gasta
> esperando al taller o a que suba sus papeles no es un mes de venta. Lo apunta
> solo el botón de publicar, la primera vez; volver a publicar no le da otro mes.

> **El documento no se guarda, se genera cada vez** con lo que hay en el
> encargo. Guardando una copia, el día que se acuerde otro precio habría dos
> papeles distintos y el que el cliente tiene delante no sería el que dice el
> ERP. Lo que sí queda guardado es cuál firmó: su número y la fecha.

> **Mientras no esté firmado sale en Pendientes**, en rojo, y **ese coche no se
> publica.** El botón de publicar lo dice primero de todo —antes que las
> puertas y que el taller— y el servidor tampoco deja. Antes se podía anunciar
> sin mandato y cobrarlo después; pero un anuncio con nuestro teléfono sobre un
> coche que nadie nos ha encargado por escrito es trabajar gratis, y cuanto más
> tarde se pide la firma más raro es pedirla.

> **Lo que ha firmado se puede descargar, aquí y en su panel.** En el ERP, desde
> el encargo. El cliente lo tiene en **Mis coches** y en su panel, en «Lo que has
> firmado», junto al precio de salida cuando lo firme. Solo ve los papeles de sus
> coches: el enlace se comprueba contra su sesión antes de abrir nada.

---

## 2 · El precio, y si lo acepta

El precio no se lo inventa nadie: sale de la **tasación gratuita** que se hace
el cliente. Aquí se habla y se guarda; **se firma después del taller**, en el
apartado 4b, porque hasta que el taller no dice cómo está el coche el número
puede cambiar.

:::flujo
cliente: Se hace la tasación gratuita de su coche
@ En PopCar, no en el ERP — llega a **IDCars**, en el encargo
+ nada: un cuestionario, y sale un importe
erp: El campo del precio arranca con lo que dio su tasación
@ IDCars → el coche → «Encargo de venta» → «Precio que le proponemos»
+ el precio, si se acuerda otro distinto, y «Guardar»
:::

> **Escribirlo no es guardarlo.** Si se teclea un número y no se pulsa
> «Guardar», el encargo lo dice debajo: «Has escrito X € y todavía no está
> guardado». Mandarle el documento del precio con el número viejo es pedirle que
> firme otra cifra.

> **Guardar no cambia el anuncio; firmarlo, sí.** El anuncio lleva siempre el
> precio que el dueño ha firmado: se pone al publicar y cambia cuando sube
> firmado un papel nuevo (apartado 4b). Antes guardar lo cambiaba al momento, y
> así un anuncio vivo podía salir a una cifra que él no había aceptado.

> **Es lo que decide la penalización**, así que no es un detalle administrativo:

| Situación | ¿Paga los 150 €? |
|---|---|
| Firmó el precio · se va antes de 30 días desde que se publicó | **Sí** |
| Firmó el precio · se va después de esos 30 días | **No** |
| Firmó el precio · todavía no se ha publicado | **Sí**: el plazo no ha empezado |
| No firmó la cláusula · no vende con nosotros | **Sí, siempre y desde el día 1** |

> **Los 30 días cuentan desde la primera publicación**, no desde el mandato ni
> desde que sube el precio firmado. Un mandato de hace dos meses con el coche
> todavía esperando al taller no ha tenido ni un día de venta. Mientras no se
> publica, el encargo dice «Los 30 días empiezan al publicar».

> **Por defecto nace en «no aceptó».** Es la respuesta prudente: da por hecho que
> se le puede cobrar, y eso lo corrige el cliente en cuanto pase. Al revés se
> dejaría de cobrar sin que nadie se entere.

---

## 3 · Las siete puertas

Ninguna es opcional. Mientras falte una, el coche no se publica: salen como una
lista con su semáforo, y el botón de publicar no deja.

Estas siete son **cosas suyas**. Lo que ponemos nosotros —la revisión del
taller y el precio firmado, en los apartados siguientes— va aparte: cuando se
le llama, lo que se le pide es esto y nada más. Él las ve en su panel como «lo
que te falta», con un botón por cada una.

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
cliente: Cuándo puede enseñarlo
@ IDCars → el coche → «Franjas horarias»
+ seis franjas como mínimo, dentro de los próximos catorce días
cliente: El seguro
@ En PopCar, desde su panel — se ve en **IDCars**, en el encargo
+ al menos un papel del seguro subido
cliente: Y el mantenimiento
@ En PopCar, desde su panel — se ve en **IDCars**, en el encargo
+ al menos una factura de revisión subida
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

> **La tasación se la hace desde su panel, y el enlace ya la abre con su coche
> dentro.** Si llega desde «lo que te falta» de su encargo, la dirección lleva
> la matrícula y la tasación empieza con la marca, el modelo, el año y los
> kilómetros ya puestos: no tiene que volver a escribir lo que ya tenemos.

> **El seguro y el mantenimiento cuentan con papel, no con datos escritos.** Una
> compañía y un número de póliza se teclean de memoria y no prueban nada. El
> historial de revisiones es lo primero que pregunta quien compra, y el seguro
> hace falta el día del traspaso.

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
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller» → «Guardar cita»
+ el taller, la dirección, el día y la hora
erp: Y se le manda
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller» → «Enviársela al cliente»
+ nada: sale con lo guardado
correo: **Al cliente** — taller, dirección, día y hora, y que desde su panel puede moverla
sistema: En su panel le sale la cita, en el resumen y en la campana
cliente: Si no le viene bien, pide otro día o que se anule
@ En PopCar, no en el ERP — le sale en rojo en **IDCars** y en Pendientes
+ «No puedo ese día» o «Anular la cita», y por qué
erp: Se le cambia la cita, o se anula
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller»
+ el día nuevo y «Guardar cita» otra vez, o «Anular la cita»
correo: **Al cliente** — el recordatorio, el día antes por la mañana o esa misma mañana
erp: Se apunta lo que dijo el taller
@ IDCars → el coche → «Encargo de venta» → «Revisión del taller»
+ lo que encontraron, y cuál de los tres resultados
sistema: Y en su panel pasa a «revisión hecha · preparando el anuncio»
:::

> **Guardar no es mandar.** «Guardar cita» deja la cita en el ERP y el cliente no
> se entera. Hasta que no se pulsa «Enviársela al cliente» no le llega el correo
> ni le sale en el panel: así se puede ir rellenando sin mandarle una cita a
> medias. Si falta algo —la dirección, la hora—, el botón dice qué.

> **Lo que pide el cliente sale en rojo y en Pendientes**, como «citas del taller
> que piden mover», con el enlace a ese coche. En el encargo sale lo que pidió y
> el motivo que escribió. Se apaga en cuanto se toca la fecha o se anula: al
> guardarla de nuevo hay que volver a pulsar «Enviársela al cliente».

> **«Anular la cita» la deja como estaba antes de darla**: «Por llevar», sin día
> y sin aviso. No borra la revisión ni lo que se hubiera apuntado.

> **El recordatorio sale solo, y una sola vez.** Lo manda una tarea que corre
> cada mañana (a las 7:00 UTC: las 9 en verano, las 8 en invierno) y recuerda
> las citas que caen en las 36 horas siguientes. Así sale el día de antes, o esa
> misma mañana si la cita se dio con menos margen. No se recuerda una cita que
> no se le ha enviado, que ya está hecha, o que ha pedido mover o anular; y
> tampoco si se le envió hace menos de tres horas, para no mandarle dos correos
> seguidos diciendo lo mismo. Va **por correo y al móvil**, como todo lo que
> le llega al cliente (ver «Avisos al móvil»).

> **Mientras tanto el cliente ve por dónde va**: la cita, luego «revisión hecha»,
> «preparando el anuncio» y «publicado» con el enlace. Lo que no ve es lo que
> apuntó el taller: eso es nuestro hasta que se lo contemos.

> **Es la puerta nuestra.** Las siete anteriores son cosas del cliente; esta la
> ponemos nosotros. Mientras no esté hecha, el botón de
> publicar sale apagado y el servidor tampoco deja: un anuncio nuestro dice que
> el coche está comprobado, y eso no lo puede sostener una foto.

> **Tres resultados, y solo uno cierra la puerta.** «Bien» y «se puede vender,
> contando lo que tiene» dejan publicar —la mayoría de los coches de diez años
> caen en el segundo—. «No se puede vender así» no deja, y ese coche sale en
> Pendientes: su dueño tiene un encargo firmado y hay que llamarle.

> **El gasto llega a las cuentas solo.** En cuanto se apunta el resultado, la
> factura del taller entra como esperada: sale en «facturas de proveedor sin
> llegar» y cuenta en el margen de ese coche. Antes se guardaba el coste en la
> ficha y de ahí no salía — el gasto que **justifica** los 150 € de cancelación
> era justo el que los libros no veían.

> **Se le hace a todos**, también a los que luego no se venden. Cuesta 60 € —el
> precio de Norauto— y ese gasto es nuestro: es lo que cubre el fee de
> cancelación.

> **La garantía mecánica no es esto.** Es un producto aparte que el cliente
> contrata o no, y **no define el sello**. Lo que hace que el coche esté
> comprobado es la revisión del taller.

---

## 4b · El precio de salida, firmado

Con el taller hecho ya se sabe lo que vale el coche. Ese número se le manda en
un documento y lo firma igual que el mandato: lo sube desde su panel.

**Sin él no se publica**, igual que sin mandato o sin taller. Un anuncio
nuestro sale con el precio que el dueño ha aceptado por escrito, y con ése y no
con otro. Además decide cuánto paga si se retira: mientras no lo acepte, la
cancelación son 150 € desde el primer día.

:::flujo
erp: Se le manda el documento del precio
@ IDCars → el coche → «Encargo de venta» → «Mandarle el precio»
+ nada: sale con el precio guardado y el coche
correo: **Al cliente** — el precio de salida y dónde subirlo firmado
sistema: En su panel le sale como un paso más, «Subir el precio firmado»
cliente: Lo firma y lo sube
@ En PopCar, no en el ERP — el encargo pasa a «Ha aceptado el precio por escrito» en **IDCars**
+ el documento firmado, en PDF, Word o una foto
erp: Y el firmado se descarga desde el encargo
@ IDCars → el coche → «Encargo de venta» → «Descargar el firmado»
+ nada: se abre el que subió
:::

> **El botón dice por qué no, mientras no toque.** Por orden: sin mandato
> firmado, sin taller hecho, con el taller diciendo «no se puede vender así», o
> sin precio guardado. Pedirle que acepte una cifra antes del taller es pedirle
> que acepte una que vamos a tener que cambiar.

> **Mientras no se le mande sale en Pendientes**, como «encargos sin mandarle el
> precio», y en el menú lateral **IDCars** lleva el número en rojo. El aviso se
> apaga al mandarlo, no al firmarlo: lo segundo depende de él, y un aviso que
> solo se apaga cuando contesta otro se queda encendido semanas. En la lista
> de IDCars cada coche dice qué le falta, y si solo es uno, el aviso de
> Pendientes lleva directo a ese coche.

> **Al subirlo, se marca solo**: que aceptó el precio, la fecha y el documento
> guardado. Y **ese precio pasa a su coche y a su anuncio**, si ya lo tiene. Es
> el único momento en que cambia el precio de un anuncio de un encargo.

> **Tiene que firmar el precio que hay guardado, no uno cualquiera.** Cada papel
> que se le manda apunta su cifra. Si después se guarda otra, el papel deja de
> valer: el encargo dice «Firmó el precio de 17.900 € y el guardado es 18.500 €:
> hay que volver a mandárselo», vuelve a salir en Pendientes, y el botón pasa a
> «Volver a mandárselo». Si intenta subir el papel viejo, su panel se lo
> rechaza. Mientras tanto, el anuncio que ya estaba publicado **se queda con el
> precio que sí firmó**: guardar una cifra nueva en el ERP no lo cambia.

> **Ya no hay casilla de «ha firmado la cláusula».** La marcábamos nosotros, y
> una casilla nuestra no puede abrir la puerta de publicar.

> **El documento se genera, como el mandato**, con su serie propia (`PC-PRECIO`)
> y lo que hay en el encargo el día que se manda.

---

## 5 · Se publica

En nuestro marketplace es un botón. En el portal es una persona.

:::flujo
erp: Se publica en nuestro marketplace
@ IDCars → el coche → «Publicar en Marketplace»
+ nada: el precio acordado y el título salen solos
trabajador: Y se pone a mano en el portal
@ IDCars → el coche → «Encargo de venta» → «Anuncios en portales»
+ el enlace del anuncio, que es por donde se entra a borrarlo
:::

> **No se publica sin mandato firmado, si falta una puerta o sin el taller.** El
> botón sale apagado y dice por qué, empezando por el mandato; pero la
> comprobación de verdad está en el servidor y antes de escribir nada: la
> promesa de que un anuncio nuestro lleva informe y se puede visitar tiene que
> sostenerse venga la llamada de donde venga.

> **El anuncio se escribe solo con lo del coche, no con su alias.** El título es
> marca, modelo y versión —si el cliente llamó a su coche «Prueba» en su panel,
> eso no sale—, y el precio es el acordado en el encargo, no el que tuviera el
> coche. Si se publicó antes de arreglarlo, hay que volver a publicar para que
> el título se refresque.

> **La ficha que ve el comprador enseña lo que hay en el ERP**: todas las fotos
> del IDCar, en el orden en que se subieron, y el informe de estado con sus
> fotos. Debajo de la financiación le ofrece venderle el coche que tiene ahora
> —«Nosotros lo vendemos por ti», 299 € solo si se vende—, que es de donde sale
> el siguiente encargo.
>
> Cambiar el orden de las fotos en el ERP todavía **no** cambia el orden de la
> ficha: sale la principal primero y después por fecha de subida.

> **El teléfono de los anuncios es el 684 717 736**, nunca el del cliente. Que no
> le llamen a él es la mitad de lo que está pagando.

> **El enlace se copia del ERP, no se escribe.** En los portales no se puede
> enlazar: solo cabe una línea de texto que alguien teclea, y por eso la
> dirección es `popcar.com.es/v/MATRÍCULA`. En el encargo hay un botón por
> portal que lo copia entero.
>
> Escrito a mano se pierde lo que va detrás: la **UTM del portal**. Sin ella, el
> comprador que llega de coches.net entra como «directo» y no hay manera de
> saber si el portal trae gente o solo cuesta dinero — que es la única pregunta
> que decide si se sigue pagando. Y escrita a mano sale unas veces «coches.net»
> y otras «Coches.net», que en el informe son dos filas distintas que nadie suma.

> **Si el coche ya se vendió, ese enlace no da error**: dice que ya no está a la
> venta y enseña otros. Los anuncios viven en los portales después de la venta y
> alguien va a pulsarlo la semana que viene.

> **Cuando el coche deja de estar publicado, sale el aviso de retirarlo.** No
> mira el estado del encargo, mira el escaparate: si el coche ya no está en
> nuestro marketplace, tampoco puede estar en los de fuera —da igual por qué se
> cayó—. Y no se apaga solo, como el nuestro: hay que entrar a coches.net y
> borrarlo. El teléfono de ese anuncio es el nuestro, así que las llamadas por
> un coche vendido las cogemos nosotros.

> **Es un portal, no cuatro.** Cuesta entre 20 y 30 € al mes según cuál.

> **El anuncio tiene que decir que el vendedor es un particular** y que nosotros
> solo gestionamos la venta. La garantía legal la da quien vende y es propietario
> del bien, y nosotros no lo somos en ningún momento — pero decirlo en el anuncio
> cierra la discusión antes de que empiece.

> **Retirar el anuncio del portal sigue siendo a mano, pero ya se vigila.** Es lo
> que pasó con el Kia Sorento: un anuncio vivo en un canal que no controlamos y
> con nuestro teléfono debajo. Ahora sale en Pendientes como «anuncios que hay
> que quitar de los portales», con el enlace a **Portales**.

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
cliente: Elige franja y pide la cita, con cuenta o **sin registrarse**
correo: **Al comprador sin cuenta** — un enlace para confirmar que ese correo es suyo
cliente: Pulsa el enlace y entonces sí se reserva
@ En PopCar, no en el ERP — cae en **Agenda** como todas
+ nombre, teléfono, correo y la casilla de financiación
correo: **Al comprador** — «hemos recibido tu solicitud», con la franja y todavía sin calendario
correo: **Al vendedor** — «alguien quiere ver tu coche»: día, franja y nombre, con su enlace para contestar
correo: **Al equipo** — que hay una visita pedida, que la confirma el vendedor
erp: Nos entra, esperando al vendedor
@ Agenda → «visitas esperando al vendedor»
+ nada: solo se sigue
:::

> **Con cuenta no hay enlace.** Si ha entrado en PopCar, su correo ya está
> comprobado por la sesión: la visita se crea pendiente al momento y le llega
> directamente «hemos recibido tu solicitud». El enlace es solo para el que
> llega sin cuenta.

> **La visita la confirma el vendedor, no la Agenda.** Es quien enseña el coche,
> en su casa y a su hora, y quien sabe si esa mañana puede. Confirmar desde el
> ERP es para concesionario, renting e importación, donde hay que llamar a
> alguien. Al vendedor le llega el nombre de quien quiere verlo y lo que
> escribió, **no su teléfono ni su correo**: la conversación pasa por nosotros.

> **Si no contesta en un día, vuelve a ser nuestra.** Mientras tanto no enciende
> el número rojo de Agenda ni sale en Pendientes. Pasadas 24 horas sube a
> «visitas por confirmar», y entonces sí hay que llamarle. Se puede confirmar o
> proponer horas por él desde la Agenda, como con un concesionario.

> **Los correos se esperan antes de contestar.** En Vercel, un correo lanzado
> sin esperar se corta en cuanto la página responde, y no deja error en ningún
> sitio. Así se perdieron los de las primeras visitas de prueba: la reserva se
> creaba y no le llegaba nada a nadie.

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

> **Y después de comprar, hay que cerrar la financiación.** Que se quedara el
> coche no es que financiara: entre las dos cosas hay una aprobación que puede
> no llegar, y puede acabar pagándolo de su bolsillo. Por eso se **apunta**, no
> se deduce.
>
> Mientras no conste, esa operación sale en Pendientes como «financiaciones sin
> cerrar». Se cierra en **Agenda**, diciendo con qué entidad se firmó y cuánto
> se financió — o marcando que al final no financió, que también se marca: una
> lista que no se vacía se deja de mirar.
>
> En cuanto consta como financiada, sale en **Comisiones** para emitirle la
> factura a la entidad. Son **150 € por operación**, y son provisionales igual
> que los **200 € por coche** del concesionario: no hay nada firmado con ninguna
> entidad todavía, así que el importe se cambia al emitir.

---

## 7 · La visita

La diferencia con el concesionario está en quién contesta: aquí la visita la
confirma el vendedor, desde el enlace de su correo o desde **Mis coches** en su
panel. Tiene tres respuestas.

:::flujo
cliente: **Me viene bien**: la confirma y dice dónde es
@ En PopCar, no en el ERP — la visita pasa a confirmada en **Agenda**
+ la dirección —sale la ubicación del coche— y por quién preguntar
correo: **Al comprador** — la cita confirmada, con la franja, dónde y el calendario
correo: **Al vendedor** — la misma, con su calendario
cliente: **No puedo**: propone hasta tres horas
@ En PopCar, no en el ERP — queda en el rastro de la visita en **Agenda**
+ el día y la hora de cada una
correo: **Al comprador** — las horas, cada una con su botón; al elegir, queda confirmada
cliente: **Ninguna**: la rechaza
@ En PopCar, no en el ERP — la visita se cancela en **Agenda**
+ nada
correo: **Al comprador** — que esa no puede ser, con el enlace para elegir otra
correo: **Al comprador y al vendedor** — el recordatorio, el día antes y esa mañana, con la franja y dónde
cliente: Se ven, y el cliente enseña su coche
erp: Cuando pasa el día, se dice cómo acabó
@ Agenda → «visitas por cerrar»
+ nada: «No fue», «Fue a verlo» o «Fue y se lo quedó»
:::

> El vendedor es el cliente particular, no un comercial nuestro. Nosotros no
> vamos a la visita.

> **Al vendedor le llega el nombre, no el teléfono ni el correo del comprador.**
> Que no le llamen directamente es parte de lo que paga. Su correo va aparte
> del del comprador: si falla uno, el otro sale igual.

> **Los correos dicen la franja entera**, «de 10:00 a 14:00», y no solo la hora
> de empezar: poner «10:00» a secas hacía creer que la cita era a las diez en
> punto.

> **El enlace del vendedor es su llave.** No hace falta que inicie sesión, igual
> que el comprador con el suyo. Nada se aplica al abrirlo —los lectores de
> correo abren los enlaces solos—: se confirma al pulsar.

> **La lista de visitas de un coche solo la ve su dueño**, con su sesión. Antes
> la podía pedir cualquiera que supiera el identificador del anuncio, y traía el
> correo y el teléfono de cada comprador y la llave para cancelar sus visitas.

> **El recordatorio les llega a los dos**, por correo y al móvil: el vendedor
> es quien abre la puerta y enseña el coche. Al vendedor, con quién viene y su
> enlace por si al final no puede. En los coches de concesionario, solo al
> comprador.

> **Si el comprador la cancela, al vendedor se le dice**, pendiente o
> confirmada, porque sabía de ella desde que se pidió: con el nombre y sin el
> correo del comprador.

---

## 8 · Cerrar el encargo

Un encargo no se acaba solo. Se cierra a mano, con uno de estos tres finales, y
cada uno dice **antes de pulsar** cuánto se le factura.

:::flujo
erp: Se cierra desde la ficha del coche
@ IDCars → el coche → «Encargo de venta» → «Cerrar el encargo»
+ nada: son tres botones con su importe
sistema: Se emite la factura y el encargo queda cerrado
sistema: Y si se vendió, se abre la transferencia
@ Gestoría → la transferencia de titularidad
+ nada: sale sola, colgando del encargo
erp: Y se imprime el contrato de compraventa
@ IDCars → el coche → «Contrato de compraventa»
+ los DNI de los dos, el domicilio, el bastidor y el precio
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

> **El papeleo lo paga el comprador, y hay que cobrárselo.** Lo dice el propio
> contrato: «los gastos e impuestos derivados del cambio de titularidad son por
> cuenta del comprador». Nosotros lo gestionamos y se lo cobramos a él.
>
> Mientras no conste cobrado, esa transferencia sale en Pendientes como
> «transferencias sin cobrarle al comprador», y se apunta en **Gestoría**: lo que
> pagó y ya está. **No bloquea nada** — el papeleo tiene plazos con la DGT que no
> esperan a que alguien apunte un cobro.
>
> Se proponen los **honorarios de la gestoría más sus tasas** como suelo, que es
> lo que ese trámite nos cuesta. Cobrar por debajo es pagar por hacer el trabajo;
> cuánto por encima lo decide quien cobra, y se escribe lo que de verdad pagó.
> Antes de esto el ERP solo guardaba el coste, así que la transferencia únicamente
> restaba en el margen del coche.
>
> **Y al apuntarlo se le emite su factura**, a su nombre y por lo que pagó. Sale
> en el mismo gesto: cobrar y facturar son lo mismo, y separarlos crearía una
> segunda lista de olvidos. Desde ahí entra en la maquinaria de siempre — aparece
> en «facturas emitidas sin enviar» hasta que alguien descargue su PDF, que es lo
> que se la manda.
>
> Ojo con los dos papeles distintos: los **299 €** se le facturan al **vendedor**
> por vender su coche; el papeleo, al **comprador**. Son dos facturas, dos
> personas y dos conceptos.

> **La transferencia sale sola, y solo al vender.** Es lo que se le prometió en
> el mandato que firmó: «cuando se vende, hacemos el contrato y la transferencia
> en la DGT». Al que se va o al que retiramos nosotros no se le abre ninguna —
> el coche sigue siendo suyo y no hay nada que transferir.
>
> Cuelga del **encargo**, no del lead: un encargo abierto desde la ficha del
> IDCar no tiene lead, y aunque lo tenga, el mandato es lo que tiene la venta.

> **El contrato lo hacemos nosotros, pero no somos parte.** El coche va del
> dueño al comprador; nosotros lo redactamos, y eso lo dice el propio
> documento. Si solo estuviera en el mandato, el comprador —que no ha firmado
> ningún mandato— no tendría forma de saber a quién le ha comprado el coche.

> **Los huecos no bloquean nada.** Los DNI, los domicilios y el bastidor no los
> tiene el ERP: se rellenan cuando se tengan, y si falta alguno el documento
> sale igual con la línea en blanco. Cerrar emite una factura y no puede
> quedarse esperando a que alguien encuentre un carné; un hueco se rellena con
> un bolígrafo, y un cierre que no se puede hacer se queda abierto para siempre.

> **La factura se le manda al descargarla, y hasta entonces sale en
> Pendientes.** El correo de cierre le dice al cliente «te llega la factura por
> separado», y quien se la manda de verdad es la persona que entra a
> **Facturación clientes** y descarga el PDF: al descargarlo sale el correo con
> el adjunto y la factura queda marcada como enviada.
>
> Mientras nadie lo haga, esa factura aparece en Pendientes como **«facturas
> emitidas sin enviar»**, con el enlace a Facturación. Antes no aparecía en
> ningún sitio: si nadie la abría, al cliente no le llegaba nada y no había
> forma de saberlo.
>
> Si el correo falla, la factura **sigue** en la lista. Se marca como enviada
> solo cuando el envío ha salido, para que un fallo no la borre del aviso
> justo el día que hace falta.
>
> **Ésta sí va al cliente** porque se le factura a él: no hay ninguna empresa
> detrás. En las otras facturas del ERP —la comisión del concesionario, la del
> portal, el fee de renting— quien paga es la empresa, y el correo sale al de
> su ficha de **Proveedores**. Es la misma pantalla y el mismo botón, así que
> conviene saber que el destinatario no siempre es el cliente.

> **Y si el coche estaba en un portal, ahí sigue.** Al despublicarse de nuestro
> escaparate sale el aviso de retirarlo, pero quitarlo lo hace una persona.

---

## Avisos al móvil

**Todo lo que le llega a un cliente por correo le llega también al móvil**, si
tiene la app de PopCar con los avisos encendidos. Al buzón del equipo, no.

| Aviso | Qué pone en el móvil |
|---|---|
| El mandato para firmar | «Tienes el mandato de venta para firmar» |
| La cita del taller, y su recordatorio | «Tienes cita en el taller» / «Recuerda tu cita en el taller», con día, hora y sitio |
| El precio de salida para firmar | «Tienes el precio de salida para firmar», con la cifra |
| Su coche ya anunciado | «Volkswagen T-Roc ya está anunciado» |
| La visita pedida, confirmada, cambiada o cancelada — al comprador | «Hemos recibido tu solicitud de visita», «Tu visita está confirmada»… |
| La visita confirmada o cancelada — al vendedor | «Alguien va a ver tu coche» / «Se ha cancelado una visita a tu coche» |
| El recordatorio de la visita, el día antes y ese día — al comprador | «Tu cita es mañana» / «Tu cita es hoy» |
| El mismo recordatorio — al vendedor particular | «Mañana vienen a ver tu coche» / «Hoy vienen a ver tu coche» |
| El cierre del encargo | «Tu encargo de venta se ha cerrado» |
| Tu informe de estado ya está | «Tu informe de estado ya está» |
| Cualquier otro correo del ERP al cliente | Su asunto, y «Te lo hemos mandado por correo» |
| La ITV que vence | La programa la propia app, a un mes y a una semana, sin pasar por el servidor |

> **En el ERP no hay que acordarse de nada.** El aviso sale del mismo sitio que
> manda todos los correos al cliente, así que un correo nuevo avisa al móvil
> solo. Tocar el aviso abre la app en el resumen, o en sus visitas si va de una
> visita.

> **Al comprador sin cuenta no le llega nada al móvil**: el aviso va al correo
> con el que entró en la app, y quien pide una visita sin registrarse no tiene
> ninguno apuntado.

> **El aviso va detrás del correo, nunca en su lugar.** El correo lleva el papel
> y queda guardado; el aviso solo dice «ya está». Si el aviso falla, no cambia
> nada: el correo ya salió y la cita ya está marcada como avisada.

> **A qué móviles se manda lo guarda una tabla**, `moveadvisor_push_devices`:
> una fila por móvil, con el correo de su dueño. Se apunta cuando el cliente
> enciende los avisos en **Perfil** de la app —el mismo interruptor que los de
> la ITV— y se borra al cerrar sesión; el servidor además quita solo los móviles
> que Google dice que ya no existen. Mientras ningún móvil se haya apuntado, la
> tabla no existe: se crea sola la primera vez.

> **Hoy no sale ningún aviso push, aunque el código esté.** Hacen falta dos
> piezas de Firebase y no está ninguna: la credencial del servidor
> (`FIREBASE_SERVICE_ACCOUNT`, **en los dos proyectos de Vercel**: PopCar y el
> ERP, que avisan cada uno de lo suyo) y el fichero de la app Android
> (`google-services.json`). Sin la segunda, el móvil no consigue registrarse y
> no se apunta en la tabla; sin la primera, el servidor guarda los móviles pero
> no manda nada. En ningún caso se rompe nada ni se le enseña un error al
> cliente. Los de la ITV sí funcionan, porque no dependen de Firebase.

> **Si alguien pide que borremos sus datos**, sus móviles también se borran: la
> línea está en la guía de supresión de PopCar, y solo hay que ejecutarla si la
> tabla ya existe.

---

## Lo que el sistema no hace

| No hace | Lo hace una persona |
|---|---|
| Llamar al cliente en 24 horas, que es lo que promete la web | Llamarle. El ERP solo avisa cuando el plazo ya se ha pasado |
| Publicar en el portal, ni retirarlo cuando se vende | Ponerlo y quitarlo a mano. El ERP apunta dónde está y avisa cuándo |
| Darle cita en el taller | Elegir taller, día y hora, y pulsar «Enviársela al cliente». El recordatorio sí sale solo |
| Cambiar la cita cuando el cliente la pide mover | Llamarle si hace falta, guardar la nueva y volver a enviársela. El ERP avisa en rojo |
| Llevar el coche al taller | Llevarlo. El resultado se apunta en el encargo |
| Contestar el teléfono del anuncio | Cualificar al comprador y mandarle el enlace |
| Conseguir la firma del mandato y del precio | Mandárselos. Los sube él firmados y el encargo se marca solo |
| Confirmar las visitas | Revisarlas en Agenda y confirmarlas: hasta entonces el vendedor no sabe nada |
| Cerrar el encargo | Elegir cómo acabó |
| Vender la financiación al comprador | Llamarle. Una hora por operación, y no se automatiza |
| Mandarle la factura al cliente él solo | Entrar a Facturación y descargar el PDF: eso es lo que la manda. El ERP avisa de las que faltan |

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Los que piden que les vendamos el coche | **Leads**, tipo «Vender su coche» |
| Abrirle el encargo | **Leads** → el lead → «Encargo de venta» |
| Qué le falta por traer | **IDCars** → el coche → «Encargo de venta» |
| El mandato, mandarlo y si lo ha firmado | **IDCars** → el coche → «Encargo de venta» |
| La cita del taller, y lo que pide el cliente | **IDCars** → el coche → «Encargo de venta» → «Revisión del taller» |
| El precio, mandarle el documento y descargar el firmado | **IDCars** → el coche → «Encargo de venta» |
| Qué coche tiene algo pendiente | **IDCars**: el número rojo del menú, y la marca en la fila de cada coche |
| Las citas que piden mover y los precios sin mandar | **Dashboard** → Pendientes, con enlace al coche |
| Publicarlo | **IDCars** → el coche → «Publicar en Marketplace» |
| Los anuncios que hay que quitar de un portal | **Dashboard** → Pendientes, y **Portales** |
| Los que están a punto de poder irse | **Dashboard** → Pendientes |
| Los que se quedaron sin franjas | **Dashboard** → Pendientes |
| Los vendidos sin cerrar el encargo | **Dashboard** → Pendientes |
| Las visitas | **Agenda** |
| Cerrar y facturar | **IDCars** → el coche → «Cerrar el encargo» |
| La factura que sale | **Facturación clientes** |

## Cómo comprobar que sigue funcionando

El camino entero, en el orden en que pasan las cosas:

    npm run test:flujo

Recorre los trece pasos contra la base de verdad —lead, IDCar, encargo, mandato,
las puertas, publicar, la visita del portal, cerrar, facturar, la
transferencia y el aviso de retirar del portal— y comprueba en cada uno lo que
tiene que ser cierto **y lo que todavía no**. Todo dentro de una transacción que
se deshace: no deja ni una fila.

> **También mira el otro lado del mismo coche.** En el paso de las puertas le
> pregunta al código de PopCar qué vería el cliente en su panel, sobre esa misma
> transacción, y compara. El fallo que no cazaría nadie es que los dos dijeran
> cosas distintas —él leyendo «ya está» mientras el ERP dice que falta la ITV—,
> porque cada lado tiene sus pruebas y las dos pasarían. Si PopCar no está en la
> carpeta de al lado, lo dice en voz alta en vez de callarse la comprobación.

> **Y que emitir la factura no es mandarla.** Comprueba que mientras no sale
> está en Pendientes como «sin enviar», y que en cuanto se marca, el aviso se
> apaga.

> **Existe por un fallo concreto.** Cerrar el encargo no despublicaba el coche,
> y como el aviso de retirar del portal mira el escaparate, no saltaba nunca: la
> alarma montada y el sensor sin conectar. Cada pieza tenía su prueba y estaban
> las dos bien — el hueco estaba justo entre ellas, que es donde una prueba de
> unidad no mira.

> **Las comprobaciones negativas son la mitad.** Sin fotos no se publica, con el
> coche en el taller tampoco, y mientras el anuncio está vivo aquí no hay nada
> que retirar allí. Una prueba que solo mira que las cosas pasen no se entera de
> que pasan antes de tiempo.

---

## Lo que falta por decidir

La lista entera, con la de los otros flujos, está en **El día en el ERP**. Aquí
va lo que toca a este camino.

| Qué | De quién depende |
|---|---|
| Con qué entidad financiera y **cómo nos llega si la aprueban** | Juan. Mientras tanto, el comprador que la pide sale en Pendientes y se le llama |
| Si al que agota el plazo se le cobra algo | Ana |
| Si la guía de subir el coche va **adjunta** al correo o enlazada | Ana. Hoy va enlazada |
| Qué pasa con el comprador financiado después de comprar | Sin diseñar |
| Configurar Firebase para que salgan los avisos al móvil | Ana. Faltan la credencial del servidor y el fichero de la app |
| Que el orden de las fotos del ERP sea el de la ficha del comprador | Sin hacer. Hoy sale por fecha de subida |

> **El mandato, el precio de salida y el contrato no los ha visto un abogado.**
> Son los papeles que firman personas, y es lo único de todo esto que, si está mal, no se
> descubre hasta que alguien discute una factura.

