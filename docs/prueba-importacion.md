# Prueba integral de una importación

Guion para recorrer una importación entera con el navegador delante, de la
solicitud a la entrega. **Ninguna prueba automática puede hacer esto**: las de
código comprueban que las piezas encajan, no que la pantalla se entienda.

Tarda unos veinte minutos. Hazla del tirón, con este documento al lado, y anota
lo que chirríe aunque parezca una tontería — un botón que no se entiende, un
orden raro, algo que no cabe.

**No hay dinero real en juego**: producción está en modo de prueba de Stripe.
Comprobado el 30 de agosto. Usa la tarjeta `4242 4242 4242 4242`, cualquier
fecha futura y cualquier CVC.

---

## Antes de empezar

- [ ] Está desplegado lo último en los dos proyectos.
- [ ] Tienes NIF y dirección en tu perfil de PopCar. Sin eso el pago no arranca.
- [ ] **Sabes a qué transportista y a qué gestoría vas a apuntar.** Se eligen
      de una lista en **Proveedores**; si no está, se añade en el momento sin
      salir de la pantalla.

---

## 1 · Pedir el coche · **en PopCar**

1. Entra en **Marketplace VO → Importación** y abre cualquier coche.

**Antes de pedirlo, mira el precio**

- [ ] Debajo del precio sale **de qué se compone**: el coche, el transporte y la
      matriculación, y el total. Las tres líneas **suman exactamente** el precio
      de arriba.
- [ ] No hay ninguna línea de margen ni de comisión: va dentro del precio del
      coche, como en cualquier compraventa.
- [ ] Debajo dice **qué se factura aparte**: el reacondicionado y el seguro.

**Y el desglose, que es de lo que va este negocio**

- [ ] Son **tres líneas** y cada una dice a quién va: el coche **al vendedor en
      Alemania**, el servicio **a nosotros**, el impuesto **a Hacienda**.
- [ ] El **precio del coche** es el del anuncio alemán, **sin nada encima**.
- [ ] El **Servicio PopCar** son 3.000 €, y son los mismos en un coche de 13.000
      que en uno de 40.000.
- [ ] Debajo se enumera **qué cubre el fee**, empezando por revisar el coche allí
      antes de liberar el dinero.

**Y la garantía**

- [ ] La primera opción es **Sin garantía**, y sale marcada: no hay ninguna
      incluida.
- [ ] Cada una lleva **su precio entero** —«+590 €»—, no una diferencia.
- [ ] Dice que **la pone una aseguradora, no nosotros**, y que **si hay que
      reclamar, reclamamos nosotros**. Ese es el argumento, no la póliza.
- [ ] Pincha una: **cambia el total** de arriba.
- [ ] Abre un coche de **más de ocho años** y mira que la premium **no sale**. No
      es un fallo: es su tope de antigüedad.

**Y el viaje: de dónde, por dónde y hasta dónde**

- [ ] Debajo del desglose hay **El viaje, incluido en el precio**, con **Desde**,
      **Pasa por** y **Hasta**.
- [ ] En *Desde* sale la **ciudad alemana de este coche**, no «Alemania» a secas.
      Compárala con la que pone la oferta.
- [ ] En *Pasa por* sale **Zaragoza**, y dice para qué: ahí se homologa y se
      prepara. Sin eso, tres semanas de espera no se entienden.
- [ ] En *Hasta* sale **tu dirección entre comillas**, con calle y código postal,
      cogida de tus datos de facturación sin que la escribas.
- [ ] Pulsa **Cambiar dirección de envío**: se abren cuatro campos —calle, C. P.,
      ciudad y provincia—. Cambia algo y mira que el *Hasta* lo recoge.
- [ ] Pon una provincia de **fuera de la península** (Illes Balears): sale el
      aviso de recargo, **y sin ninguna cifra**. Vuelve a poner Madrid.
- [ ] Abre otro coche: la dirección que escribiste **sigue puesta**.

**Y lo que se contrata aparte**

- [ ] Debajo sale **«Si quieres, aparte»** con **dos** cosas: seguro y
      reacondicionamiento. La entrega **no** está: va dentro del precio.
- [ ] Las dos ponen **«a consultar»**, no un cero: un cero diría que es gratis.
- [ ] Márcalas: **el precio de arriba no se mueve**, ni el depósito.
- [ ] Debajo dice que **ninguno entra en la fianza**: ni en el depósito ni en el precio.

**Y la ficha técnica**

- [ ] En **Cilindrada** sale un número —1.600 cc, 1.400 cc— o un guion. **Nunca
      «EV»** en un coche que no sea eléctrico. Es lo que ponía antes en todos.

2. Pulsa **Solicitar importación** y rellena.

**Qué tiene que pasar**

- [ ] Sale «Solicitud recibida» con **los pasos** explicados.
- [ ] Sale **la cifra a depositar** y que se paga por transferencia.
- [ ] Dice que **no se le paga al vendedor** hasta que vemos el coche en
      Alemania, y que si no es el que se anunció se devuelve entero.
- [ ] **No aparece ningún número de cuenta escrito en la página.** El IBAN lo
      enseña Stripe, contra la sesión de ese cliente.
- [ ] Debajo, **«Prefiero que me llaméis antes»**.
- [ ] Te llega un correo con la cifra y con cuándo se libera.
- [ ] El depósito es **el precio del coche más 3.000 €**, y la garantía si
      elegiste una. **No** lleva el impuesto de matriculación.
- [ ] En **Solicitudes** aparece una tarjeta, en la pestaña *Pendiente*.

**Prueba también esto**: cierra el modal y vuelve a pedir el mismo coche. **No
debe crearse una segunda solicitud**, ni llegarte otro correo.

**Y esto**: vuelve al coche, **cambia de garantía** y pídelo otra vez. Sigue sin
crearse una segunda solicitud, pero la tarjeta de *Solicitudes* tiene que
enseñar **la cifra nueva**, no la de la primera vez. Lo que se le pide es siempre
lo último que se le enseñó.

---

## 2 · Pagar el depósito · **como cliente, en PopCar**

En tu panel, en la tarjeta de la solicitud, pulsa **«Ver los datos para
transferir»**.

- [ ] Te lleva a **Stripe**. Si se queda en la pantalla diciendo que no está
      disponible, falta la clave o el método de pago: mira el paso de abajo.
- [ ] La cifra es **el precio del coche más 3.000 €**. **No** lleva el impuesto
      de matriculación.
- [ ] Paga con la tarjeta de prueba **4242 4242 4242 4242**, cualquier fecha
      futura y cualquier CVC.

> **Por qué hay tarjeta si el depósito va por transferencia.** Solo la hay con
> clave de prueba, y es para poder recorrer el flujo: simular la llegada de una
> transferencia es más incómodo que teclear la 4242. Con clave real la tarjeta
> desaparece sola y solo queda la transferencia.

**Qué tiene que pasar, al volver**

- [ ] La tarjeta del panel pasa a **«Depósito retenido el …»**, sin recargar.
- [ ] El paso dice **«Tu dinero está en la cuenta de depósito, retenido. Vamos a
      ver el coche en Alemania.»**
- [ ] Te llega **la factura por correo, con su PDF**.
- [ ] La factura es de **3.000 €**, no del depósito entero. Y su número empieza
      por **SRV**, no por FIA.
- [ ] Está en **Facturación**, y el concepto dice **«Servicio de importación»**.

Eso último es lo que más importa comprobar: de los ~20.000 € que has pagado,
solo 3.000 son ingreso de PopCar. El resto es del vendedor alemán y está de
paso. Facturarlo entero sería declarar la venta de un coche que no hemos
vendido.

- [ ] Vuelve a la ficha del coche e intenta **cambiar la dirección de envío**:
      ya no se deja. Con el dinero depositado queda fijada.

---

## 3 · Ver el coche y soltar el dinero · **en el ERP**

Este es el paso que sostiene el producto. Ve a **Importaciones** y abre el
expediente.

**El bloque azul de arriba**

- [ ] Enseña el depósito **partido**: el coche → vendedor alemán, el servicio →
      nosotros. Las partes **suman** la cifra grande.
- [ ] Dice **«En la cuenta desde el …»**, con la fecha de tu pago.

**Y debajo, «Antes de soltar el dinero»**

- [ ] El botón **«Liberar el pago al vendedor»** está **apagado**, y dice por
      qué: hasta que alguien nuestro no vea el coche, ese dinero no se mueve.
- [ ] Pulsa **«Hemos visto el coche en Alemania»**. Ahora el otro se enciende.
- [ ] Púlsalo. El expediente pasa **solo** a «Verificado y pagado».
- [ ] Vuelve a mirarlo: **ya no se puede liberar otra vez**. Un segundo clic con
      el dinero enviado sería un segundo pago.

> Si te lo encuentras al revés —el botón encendido sin haber marcado que has
> visto el coche— páralo y dímelo. Esa es la única regla del sistema que no
> tiene excepción.

**Lo que pasa solo al liberar**

- [ ] En el panel del cliente, el paso dice **«Hemos visto el coche y lo hemos
      comprado en tu nombre.»**
- [ ] En **Pedidos** aparece uno **creado solo**. Eso es el paso 4.

---

## 3b · La fecha y las notas · **en el ERP**

Sigues en el expediente de Importaciones.

- [ ] Se ha desbloqueado **«Cuándo le hemos dicho que lo tendrá»**. Pon una
      fecha.
- [ ] Cámbiala. **Al cliente le llega un correo con las dos fechas.**
- [ ] Escribe una nota interna y guárdala. Tiene que decir **«Guardada»**.
- [ ] Abajo, en el **historial**, se lee la nota entera y quién la escribió.

---
## 4 · El pedido · **en el ERP**

Ve a **Pedidos**. Tiene que haber uno **creado solo**, con el proveedor alemán y
su precio — que **no** es la cifra que ve el cliente.

### Qué hace falta en cada fase

Un pedido no pasa de fase si le falta lo que esa fase **significa**. No es
papeleo por papeleo: cada cosa se pide en el momento en que se sabe, y ni antes
ni después. Si falta algo, la pantalla te lo dice **antes** de que lo intentes,
y el botón se queda apagado.

| Para pasar a | Hace falta | Por qué ahí |
|---|---|---|
| **Pedido** | A quién se le encarga. Si es un particular, además las cuatro comprobaciones | Encargarlo es comprometerse: sin proveedor no hay a quién reclamar, y a una persona no se le paga sin mirar cargas y deudas |
| **Confirmado** | Por cuánto se ha cerrado | Confirmado quiere decir que hay precio acordado. Sin importe, el coste y el margen de ese coche salen mal desde el primer día |
| **En camino** | Los papeles imprescindibles de su origen, la compra pagada, y que alguien lo haya recogido | Es el momento en que el coche se mueve de verdad. Sin sus papeles y sin pagar, lo que viaja es un coche de otro; y «en camino» sin transporte era una casilla que se marcaba sola |
| **Recibido** | Kilómetros y llaves | Los kilómetros se leen antes de moverlo y las llaves se cuentan delante de quien lo trae. Después ya no se puede |

Lo que **no** se pide: papeles para confirmar —llegan en momentos distintos, la
factura con el pedido y la ficha la devuelve la gestoría— ni «Al llegar» antes
de que el coche llegue. Y **cancelar no pide nada**: renunciar a comprar es lo
contrario de avanzar.

Por lo mismo, **el pedido abierto solo enseña lo de su fase**: en *Pedido* no
salen los kilómetros de un coche que sigue en Alemania, ni lo que cuesta
reacondicionar uno que nadie ha visto. No se pierde nada — abajo del todo hay
**«Ver todos los datos del pedido»** para corregir cualquier cosa en cualquier
momento.

Saltarse fases tampoco vale de atajo: ir de *Borrador* a *En camino* de una vez
exige lo mismo que haber ido paso a paso.

### «A nombre de»: en importación, *El cliente*

Son los dos botones de arriba del pedido.

**En una importación viene puesto en *El cliente*, y es lo correcto.** PopCar no
compra ese coche: lo compra el cliente al concesionario alemán y nosotros
cobramos un fee por traerlo. Se matricula directamente a su nombre, no hay
ningún cambio de nombre que pagar, y **el plazo de reventa no corre**, porque el
coche nunca es nuestro.

- [ ] Comprueba que el pedido viene con **El cliente** puesto.
- [ ] Y que **no** sale ninguna fecha límite de reventa.

Lo de abajo es para los otros caminos —concesionario, ex-renting, particular—,
donde sí compramos para revender. Ahí PopCar vende, con su factura y su
garantía, y ahí está la diferencia entre pagar un cambio de nombre o dos.

| | *PopCar* — lo normal | *El cliente* — el caso raro |
|---|---|---|
| Cambios de nombre | **Dos**: vendedor→PopCar al comprarlo, PopCar→cliente al venderlo | **Uno**: del vendedor al cliente |
| Cuándo | Al comprarlo, y otra vez al venderlo | Al venderlo |
| Plazo de reventa | **Sí**: el pedido enseña hasta cuándo, y avisa dos meses antes | No corre |
| Cuándo se usa | Casi siempre: el coche se compra, se recibe, se matricula, se deja a punto y se vende | El coche va del vendedor directo al cliente y nos ahorramos un cambio de nombre |

**En esos caminos viene puesto en *PopCar*, aunque haya un cliente esperando**,
porque es lo normal ahí: PopCar compra el coche y luego se lo vende, con su
factura y su garantía, y todo eso se hace sobre un coche que es nuestro.

El precio de eso es el plazo: con el coche a nuestro nombre hay un límite para
revenderlo sin que el impuesto de la compra se quede. Pasado, la factura aparece
meses después sobre un coche que ya no interesa a nadie. Por eso el pedido enseña
la fecha límite en cuanto lo recibes, y avisa dos meses antes.

### Recórrelo

Va por fases, y **el orden importa**: cada bloque comprueba lo que pide *esa*
fase. Hazlos seguidos y sin adelantarte, o las puertas no dan lo que dicen aquí.

- [ ] Fíjate primero en **lo que sale y lo que no**: en fase *Pedido* solo están
      «A nombre de», el estado, y tres campos — proveedor, importe y para cuándo
      lo esperamos. **No** salen la matrícula ni el bastidor, que un coche de
      importación todavía no tiene o no hace falta, ni «Al llegar», ni el
      reacondicionado.
- [ ] Mira las etiquetas de esos tres campos: solo el **importe** dice «hace
      falta para Confirmado». Los otros ponen **opcional**, y debajo cuándo se
      saben. Si un hueco está vacío no es que falte: es que aún no toca.
- [ ] Pulsa abajo **«Ver todos los datos del pedido»**: aparece todo, los cinco
      campos incluidos. Vuelve a dejarlo como estaba.

**Antes de nada, a nombre de quién va**

- [ ] Mira **«A nombre de»**: viene en ***PopCar***, que es lo normal — lo
      compramos nosotros y luego se lo vendemos. Púlsalo en *El cliente* para ver
      cómo cambia la explicación de debajo, y **déjalo otra vez en *PopCar***.
      Esto no es de ninguna fase: se puede cambiar cuando sea, y el plazo de
      reventa no aparece hasta que el coche se recibe.

**Para confirmarlo: solo el precio**

- [ ] Borra el importe y pulsa **Guardar los datos**. El botón de **«Pasar a
      Confirmado»** se apaga, y encima sale en ámbar **«Por cuánto se ha
      cerrado»** con el motivo.
- [ ] Vuelve a poner el importe y guarda. El botón se enciende: pásalo a
      **Confirmado**.
- [ ] Fíjate en lo que **no** ha hecho falta: no has subido ni un papel. Es a
      propósito — la factura llega con el pedido y la ficha la devuelve la
      gestoría, así que pedirlos aquí sería pedir algo que todavía no existe.

**Para moverlo: papeles, pagado y recogido**

Tres cosas, y las tres son la misma idea: que el coche sea nuestro y que se esté
moviendo de verdad.

- [ ] Sin hacer nada aún, mira el botón de **«Pasar a En camino»**: está apagado,
      y el aviso de arriba lo nombra todo — los cuatro papeles (ficha partes I y
      II, COC y factura del vendedor), el número de la factura, que esté pagada,
      y que alguien lo haya recogido.
- [ ] Baja a **Documentos** —que aparece justo al confirmarlo, no antes—: arriba
      está la lista de lo que se espera de un coche alemán, con esos cuatro
      marcados como imprescindibles.
- [ ] Sube un PDF cualquiera diciendo que es la **ficha del vehículo (parte II)**.
      Ese hueco se cierra, y **sin recargar** el aviso de arriba pasa a nombrar
      solo tres.
- [ ] Sube otro **sin decir qué papel es**. **No debe cerrar ningún hueco**: si
      cerrara, bastaría con subir cualquier cosa para ponerlo todo en verde.
- [ ] Sube los tres que faltan. El aviso se acorta, pero el botón **sigue
      apagado**: falta pagar y falta que salga.
- [ ] Rellena **«Factura del vendedor (número)»** y **«Pagada el»**, y guarda.
      El aviso se queda con una sola cosa: que nadie lo ha recogido.

Ahí se queda el pedido. Lo que falta no se hace aquí: se hace en Transportes, que
es el paso siguiente.

---

## 5 · El transporte · **en el ERP**

Ve a **Transportes**. Tiene que haber un tramo **creado solo**, en *Por
organizar*.

- [ ] En **Desde** sale la **ciudad alemana de la oferta** —Fürth, Aachen, la que
      sea—, no el nombre del vendedor ni «Alemania». Es el mismo sitio que veías
      en la ficha de PopCar.
- [ ] En **Hasta**, «Zaragoza». Este es solo el primer viaje: el coche tiene que
      pasar por la ITV de homologación antes de poder matricularse.
- [ ] Intenta pasarlo a **Contratado** sin transportista. **Te lo impide.**
- [ ] Elige el transportista de la lista. Si no está, pulsa **+ Añadir uno
      nuevo** y escríbelo: se queda dado de alta.
- [ ] Pon el precio y contrátalo.
- [ ] **Vuelve al pedido sin tocar nada más.** El botón de «Pasar a En camino»
      sigue apagado: contratado no es recogido, y un camión reservado no mueve
      ningún coche.
- [ ] Vuelve al transporte y pásalo a **Recogido**.
- [ ] Vuelve al pedido: ahora sí. Pásalo a **En camino**.
- [ ] Vuelve al transporte y pásalo a **Entregado**.
- [ ] Sube una foto en **Documentos** del transporte.

> Si algún día te lo encuentras al revés —el coche ya entregado y el pedido
> todavía en *Confirmado*— también deja pasarlo: haber llegado es haber salido.

---

## 6 · Al llegar · **en el ERP**

Vuelve al pedido.

- [ ] Intenta pasarlo a **Recibido** sin más. **Te lo impide**: faltan los
      kilómetros y las llaves.
- [ ] Rellena **Al llegar** —kilómetros, llaves, algún daño— y guarda.
- [ ] Ahora sí pasa a **Recibido**.
- [ ] Vuelve a **Transportes**: hay un **segundo tramo**, creado solo, de
      **Zaragoza** a **tu dirección**, con la calle y el código postal que
      pusiste en la ficha. Es el viaje de entrega, y va en el mismo precio.
- [ ] El primero **sigue estando**: son dos tramos del mismo coche, no uno
      reescrito.
- [ ] Marca **«No es lo que se compró»** sin escribir nada y guarda. **Te lo
      impide**: decir que algo está mal sin decir qué se reclama no sirve de
      nada dentro de un mes. Escríbelo o desmárcalo.

---

## 7 · Los papeles · **en el ERP**

Ve a **Gestoría**. Tienen que aparecer **tres trámites creados solos**: impuesto
de matriculación, ITV de homologación y matriculación.

- [ ] **No hay ninguna transferencia.** Un coche que nunca ha estado matriculado
      aquí no se transfiere.
- [ ] Intenta mandar uno a gestoría sin decir cuál. **Te lo impide.**
- [ ] Elígele gestoría de la lista y ponle coste, mándalo, y luego márcalo
      **Resuelto**.
- [ ] Los que estén fuera salen arriba, con los días que llevan.

---

## 8 · Lo que ha costado · **en el ERP**

En el pedido, abajo:

- [ ] Añade un gasto de **Reacondicionado** (unos neumáticos).
- [ ] En **Lo que cuesta** tienen que salir **cuatro líneas**: proveedor,
      transporte, gestoría y reacondicionado.
- [ ] La suma tiene que cuadrar con lo que has ido metiendo.
- [ ] Como no está vendido, dice **«esto es lo que llevamos puesto»**, no una
      pérdida.

---

## 9 · La entrega · **en el ERP**

En el expediente de **Importaciones**, en «La entrega»:

- [ ] Marca lo que le das: permiso, ficha, llaves, factura.
- [ ] Intenta cerrarla sin kilómetros. **Te lo impide.**
- [ ] Pon los kilómetros de salida y pulsa **Firmado y entregado**.
- [ ] Sale la **garantía**, con su fecha de fin.
- [ ] Pasa el expediente a **Entregado**.
- [ ] **Al cliente le llega un correo diciendo que ya es suyo.**

---

## 10 · Y por el lado del cliente

Vuelve a PopCar, a su panel:

- [ ] La solicitud está en **Finalizadas**.
- [ ] Ha ido cambiando de paso a lo largo de toda la prueba.
- [ ] Sus facturas están en Facturación.
- [ ] **No ve nada** del proveedor, ni del coste, ni de las notas internas.

---

## 11 · Con quién has trabajado · **en el ERP**

Ve a **Proveedores**.

- [ ] Están el transportista y la gestoría que has usado.
- [ ] Abre el transportista: en **Lo que llevamos con él** tiene que salir ese
      transporte con su importe.
- [ ] Abre la gestoría: sus trámites y lo que han costado.

**Y sus tarifas** — en el transportista, más abajo:

- [ ] Intenta añadir una tarifa **sin ningún precio**. **Te lo impide**: un
      corredor que parece cubierto y no lo está es peor que no tenerlo.
- [ ] Añade una de **Alemania → España** sin ciudades, con 900 / 750 / 620.
- [ ] Añade otra de **Múnich → Madrid** con 850.
- [ ] Vuelve a un tramo de transporte de ese mismo transportista: las dos salen
      al lado del coste, para compararlas antes de escribirlo.

> De las dos, para un coche que está en Múnich gana la de Múnich aunque sea más
> cara: alguien cerró ese corredor a propósito. Para uno en Hamburgo, la general.

Esa es la pregunta que justifica tener la lista: cuánto llevamos con cada uno.

---

## Al terminar

Dime lo que hayas anotado. Y si quieres dejarlo limpio, pídeme que borre lo que
haya creado la prueba: la solicitud, el pedido, sus trámites, su transporte y sus
gastos.
