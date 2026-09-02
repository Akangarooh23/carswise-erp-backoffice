# Marketplace VO — Importación

Un cliente pide un coche de la sección **Importación**: coches que están en
Alemania y que traemos nosotros.

## Lo primero, porque cambia todo lo demás

**PopCar no compra el coche.** Lo compra el cliente al concesionario alemán, y
nosotros cobramos **3.000 €** por encargarnos de todo lo de en medio: ir a verlo
allí, recogerlo, traerlo, pasar la ITV de homologación, hacer la documentación,
revisarlo al llegar y entregárselo en casa.

No es un matiz jurídico. De ahí salen cuatro cosas que hay que tener claras:

- **La venta es entre el concesionario alemán y el cliente.** Nosotros no somos
  parte de esa compraventa.
- **La garantía no la damos nosotros.** No vendemos el coche, así que no se la
  debemos. Lo que ofrecemos es una garantía mecánica de un tercero, y algo que
  no cabe en un producto: **reclamamos nosotros**.
- **El coche se matricula a nombre del cliente.** Nunca es nuestro, así que no
  hay cambio de nombre que pagar ni plazo de reventa que vigilar.
- **Facturamos el servicio, no un coche.**

**Aquí no hay visita.** No se puede ver un coche que está en Alemania, así que
no hay calendario ni horas que confirmar: el cliente pide que se lo traigamos y
alguien le llama. Por eso este flujo **no vive en la Agenda, sino en
Importaciones**, su propia sección del menú.

## Lo que cambia respecto a un coche de aquí

| | Concesionario y Ex-Renting | Importación |
|---|---|---|
| Qué pide el cliente | Una **visita**, con día y hora | Que **le traigamos** el coche |
| Dónde aparece | **Agenda** | **Importaciones** |
| Hay que aprobar | Sí, siempre | No: hay que llamar |
| Quién vende | PopCar | **El concesionario alemán** |
| Quién da la garantía | PopCar | **Un tercero**, y nosotros reclamamos |
| A nombre de quién va | Normalmente PopCar | **Siempre del cliente** |
| Dinero por delante | No | **El coche entero y nuestro fee, a una cuenta de depósito** |
| Cuándo lo ve | En días | En semanas: hay que traerlo |

---

## La pantalla de Importaciones

Una columna por etapa, y cada columna dice qué toca hacer con esos coches. Se
lee de izquierda a derecha: lo de la izquierda es lo que está empezando.

| Columna | Qué toca |
|---|---|
| Pendiente | Llamar y explicarle el proceso |
| Contactado | Esperando su transferencia a la cuenta de depósito |
| Depósito retenido | **Ir a ver el coche en Alemania** |
| Verificado y pagado | Confirmar fecha y organizar el transporte |
| En transporte | El coche viene de camino |
| En trámites | Impuesto, ITV de homologación y matrícula |
| Entregado | Cerrado |

La etapa que sostiene todo lo demás es la tercera: con el dinero ya en la cuenta,
alguien nuestro tiene que ir a ver el coche. Hasta que no lo ha visto, no se
suelta un euro.

Arriba hay cuatro números. El que importa es el de **dinero depositado**: es
dinero de clientes que está retenido y de coches que todavía no hemos entregado.
No es nuestro.

Al pulsar un coche se abre su expediente con todo lo que se puede hacer: marcar
que el dinero ha llegado, marcar que se ha visto el coche, liberar el pago,
pasarlo de etapa, poner la fecha de entrega y devolver el depósito. Un expediente
que lleva más de una semana parado lo dice en rojo en su tarjeta.

Tres cosas que la pantalla no te deja hacer, a propósito:

- **Liberar el pago sin haber visto el coche.** Es la promesa que le hemos hecho
  al cliente, y es la única regla que no tiene excepción. La pantalla apaga el
  botón y la API lo rechaza aunque la pantalla dejara pulsarlo.
- **Pasar a «Verificado y pagado» sin el dinero depositado.** Ir a ver un coche
  cuesta un vuelo; lo que lo cubre es que el cliente ya haya transferido.
- **Poner fecha de entrega antes de la compra.** La fecha la da el vendedor al
  aceptarlo. Antes de eso cualquier fecha es inventada, y el cliente la ve en su
  panel como una promesa.

---

## Cómo va

:::flujo
cliente: Entra en **Marketplace VO**, pestaña **Importación**, y abre un coche
cliente: Pulsa **Solicitar importación** y deja nombre, correo, teléfono y su mensaje
sistema: Le dice **cuánto paga**: el coche, nuestro servicio y el impuesto a cuenta
correo: **Al cliente** — su solicitud, con esa cifra y cuándo se libera · **A operaciones** — solicitud nueva
erp: Sale en **Importaciones**, en la columna **Pendiente**, con su depósito
trabajador: Le llama y le cuenta el proceso
cliente: **Transfiere** desde su panel, con el número de cuenta que le da Stripe
sistema: Al llegar el dinero, el expediente pasa a **Depósito retenido** y **sale su factura** del servicio
trabajador: **Va a Alemania a ver el coche** y marca que lo ha visto
? ¿Es el coche que se anunció?
rama Sí | **Liberar el pago al vendedor** | El expediente pasa solo a **Verificado y pagado** y nace su pedido
rama No | **Devolver el depósito** | Vuelve entero: no se ha pagado a nadie
trabajador: Escribe **cuándo lo tendrá**. Si luego cambia, al cliente se le avisa solo
trabajador: En transporte → En trámites. Él lo ve en su panel sin llamar
trabajador: Al matricular, **liquida el impuesto**: se cobra o se devuelve la diferencia
trabajador: Cuando lo tiene, **Entregado**
:::

## El depósito

Es lo primero que hay que mirar al abrir un expediente, y sale arriba del todo.

**No es una fianza.** Una fianza es una parte del precio que se adelanta a quien
te vende. Aquí no le vendemos nada: el cliente paga **el coche entero, nuestro
fee y el impuesto**, y ese dinero **no se le paga al vendedor** hasta que uno de
los nuestros está delante del coche en Alemania y confirma que es el que se
anunció.

Esa es la promesa entera del producto. Un particular que compra en Alemania por
su cuenta transfiere veinte mil euros a un desconocido de otro país y espera.
Aquí no.

### Lo que hay dentro, y de quién es

El expediente lo enseña partido, porque cada parte tiene un dueño distinto:

| Parte | Va a | |
|---|---|---|
| Precio del coche | El **concesionario alemán** | firme |
| Servicio PopCar | **Nosotros** | firme |
| Impuesto de matriculación | **Hacienda** | **a cuenta** |
| Garantía, si la contrató | **Su proveedor** | firme |

El día que se libera hay que soltar lo del vendedor y no lo demás, y quien lo
haga tiene que verlo ahí, no calcularlo.

**El impuesto va a cuenta, no como precio cerrado.** Se cobra lo estimado y se
liquida al matricular, cuando ya se sabe cuánto es de verdad.

Eso no es un detalle contable: **es lo que protege nuestro fee**. Si el impuesto
fuera un precio cerrado y el real saliera por encima —pasa en los coches de más
de 160 g/km, que pagan el doble del tramo que estimamos— esa diferencia saldría
de nuestro margen. Así la paga siempre el cliente, que es de quien es.

Y va dentro y no aparte porque la alternativa es peor: con el coche ya pagado al
alemán y de camino, pedirle mil cuatrocientos euros más es un cobro que se puede
caer, y el coche está a su nombre desde el principio.

### Es el que se le dijo, no el que saldría hoy

Se guarda al pedirlo: si el precio del anuncio cambia después, o el coche deja
de estar publicado, el suyo sigue siendo el que se le prometió. Si alguien
discute la cifra, la que vale es la que pone ahí.

Y si vuelve a la ficha, cambia de garantía y **lo pide otra vez**, no se abre un
segundo expediente: se reutiliza el suyo, con la cifra nueva. Lo que se le pide
es siempre lo último que se le enseñó.

### Cómo paga, y por qué no con tarjeta

**Por transferencia.** Desde su panel pulsa **«Ver los datos para transferir»** y
Stripe le da un número de cuenta suyo. Cuando el dinero llega, **nos enteramos
solos**: eso es lo que aporta Stripe aquí, no hay que mirar el banco a mano.

No con tarjeta, y no es una preferencia: un coche de 20.000 € llevaría unos 300 €
de comisión —el 10 % de nuestro fee—, choca con el límite de cualquier tarjeta
particular, y una tarjeta se puede disputar meses después, cuando el dinero ya
está en Alemania.

**El número de cuenta no está escrito en la web.** Lo enseña Stripe contra la
sesión de ese cliente. Un IBAN en una página es la forma más fácil de que alguien
haga una captura, cambie un dígito y la reenvíe.

Si algo falla y paga por su cuenta, se puede marcar a mano en su ficha con **«El
dinero ha llegado a la cuenta»**. Si se marcó por error, se quita desde el mismo
sitio.

> **Ojo con lo que le decimos.** Ese dinero entra hoy en la cuenta de PopCar, no
> en un depósito de verdad. Por eso al cliente **no se le dice que está**
> **retenido**: se le dice lo que es cierto, que no se le paga al vendedor hasta
> que hemos visto el coche. El escrow de verdad llega con PayComet o MangoPay.

> **Y en pruebas hay tarjeta.** Con clave de prueba se ofrece también la tarjeta,
> para poder recorrer el flujo sin simular una transferencia. Con clave real
> desaparece sola.

### Soltar el dinero

Debajo del depósito hay dos botones, y en este orden:

1. **Hemos visto el coche en Alemania.** Lo marca quien fue a verlo, con su fecha.
2. **Liberar el pago al vendedor.** No se puede pulsar sin lo anterior.

El segundo se apaga solo cuando falta el primero, y dice por qué. Pero **quien
decide es el servidor**: aunque la pantalla dejara pulsar, la API lo rechaza y
contesta qué falta.

Al liberarlo, el expediente pasa solo a **Verificado y pagado**. Y no se libera
dos veces: un segundo clic con el dinero ya enviado sería un segundo pago.

### Liquidar el impuesto

Al matricular se sabe lo que ha costado de verdad, y la gestoría lo escribe en
su trámite de **«Impuesto de matriculación»**. De ahí sale la liquidación sola:
no hay que teclearlo en ningún otro sitio, y por eso no puede acabar diciendo
dos cosas distintas.

En el expediente sale un bloque debajo del depósito:

```
Liquidación del impuesto
  Puso a cuenta          1.420 €
  Ha salido              2.100 €
  ─────────────────────────────
  Hay que cobrarle         680 €

  [ Ya lo he liquidado ]
```

Si sale al revés dice **«Hay que devolverle»**, y si cuadra, que no hay que mover
nada. **No aparece hasta que hay coste en el trámite**: un bloque diciendo
«pendiente» durante seis semanas es ruido.

**El botón no mueve dinero, deja constancia.** Cobrar o devolver la diferencia se
hace por el mismo sitio que el depósito. Se puede desmarcar: si se marcó por
error, hay una diferencia sin cobrar detrás de esa casilla.

**Y no se puede cerrar la entrega con la liquidación pendiente.** Si salió más
caro y se entrega sin cobrar la diferencia, ese dinero no se recupera: el cliente
ya tiene su coche y la conversación es mucho más difícil. Y si hay que
devolvérsela, dejarlo para después es no hacerlo.

El cliente lo ve en su panel en cuanto se sabe, antes de que se lo digas por
teléfono. Una cifra que aparece en una llamada suena a que se nos ha olvidado
algo.

### Si hay que devolverlo

**Devolver el depósito**, en su ficha. Pide un motivo, que es lo que se le cuenta
al cliente.

Si algo falla al devolver, no se marca nada: un expediente que dice «devuelto»
con el dinero todavía dentro es peor que un error en pantalla.

El ingreso y la devolución **quedan los dos**, cada uno con su fecha. No se borra
lo que pasó.

---

## De qué se compone el precio

Tres líneas, y cada una va a un sitio distinto. Eso es lo que hay que entender de
este negocio y lo que la ficha deja claro:

| Línea | Qué es | Va a |
|---|---|---|
| **Precio del coche** | Lo que cuesta en Alemania, sin nada encima | El vendedor alemán |
| **Servicio PopCar** | 3.000 €, siempre el mismo, **con el IVA dentro** | Nosotros |
| **Impuesto de matriculación** | Una estimación | Hacienda |
| **Garantía mecánica** | La de por defecto; se puede quitar | La aseguradora |

**El IVA va dentro de los 3.000.** A un particular los precios se le dicen con el
impuesto dentro, así que eso es lo que paga. Por dentro son **2.479,34 de base y
520,66 de IVA**, y eso es lo que sale desglosado en su factura. Lo que ganamos se
cuenta sobre la base: contar los 3.000 enteros sería creerse 521 € por coche que
no existen.

**Y en la factura, los suplidos.** El coche es del vendedor alemán y el impuesto
de Hacienda: los dos pasan por nuestra cuenta y ninguno es ingreso nuestro, así
que van en un bloque aparte, **fuera de la base de IVA**, con su explicación y con
el total de lo que transfirió. Sin ese bloque, la factura diría 3.000 € al lado de
una transferencia de 21.500 y esa diferencia no tendría explicación en ningún
papel.

El fee va suelto y con su nombre, al revés que el margen de antes, que iba
escondido dentro del precio del coche. Cuando vendes un coche, lo que ganas no se
desglosa. Cuando vendes un servicio, **lo que se vende es eso**: el cliente tiene
que ver qué le estás haciendo por ese dinero.

Por eso debajo del total se enumera lo que cubre: revisar el coche allí en
persona antes de liberar su dinero, recogerlo y traerlo, la ITV de homologación y
la documentación, revisarlo al llegar y llevárselo a casa.

### Es el mismo fee para todos los coches

Y es a propósito: el trabajo es el mismo. El mismo viaje, la misma ITV, las
mismas gestiones. Cobrar más por un coche caro sería cobrar por el coche, y el
coche no lo vendemos nosotros.

Lo que sí depende del precio es si al cliente le compensa, y eso se resuelve con
un mínimo: **por debajo de 12.000 € no se publica**. Con un fee de 3.000 €, un
coche de 5.000 sale por 8.000 antes del impuesto, y la diferencia con comprarlo
aquí no da para pagarlo. Está medido: por debajo de 10.000 € la brecha mediana
con España son 2.050 €, y el fee más el impuesto se la comen entera.

### El impuesto sigue siendo una estimación

Se aproxima con la banda de 121–159 g/km sobre el precio español de coches
comparables. No se puede calcular bien todavía: **ninguna oferta alemana trae el
CO₂**. Se equivoca hacia arriba a propósito — en un precio público, pasarse es
recuperable y quedarse corto es una promesa que no se puede cumplir.

Es el número que más va a mejorar cuando entre Eurotax.

---
## Antes de soltar el dinero al vendedor

Liberar el pago es **el único momento del sistema en que se mueve dinero
ajeno**. Por eso tiene tres porteros, y los tres miran lo que hay guardado y no
lo que venga en la petición:

1. **El cliente ha depositado.** El estado del depósito dice «retenido».
2. **Alguien nuestro ha visto el coche** en Alemania y ha confirmado que es el
   que se anunció.
3. **Sabemos a quién se le manda**: el vendedor tiene IBAN, NIF y correo en su
   ficha de Proveedores.

El tercero es el más nuevo y el que menos parece un portero. Lo es: el IBAN
porque sin él no hay transferencia posible, el NIF porque va en la factura del
coche y permite comprobar que la sociedad existe, y el correo porque es a quien
se le pide **esa factura, a nombre del cliente**. Sin ella los 16.890 € no son
un suplido —son ingreso de PopCar, con unos 3.500 € de IVA sobre dinero que no
es nuestro—.

El teléfono y la dirección no bloquean nada. Se agradecen, pero parar un pago
por no tener un teléfono sería pararlo por nada.

Va aquí y no al confirmar el pedido a propósito: **confirmar es decir que el
vendedor acepta; soltar es transferirle diecisiete mil euros de un cliente**.

Los vendedores aparecen solos en Proveedores —una rutina barre los nombres ya
escritos en pedidos, transportes y trámites y da de alta a quien falte— pero
aparecen **con el nombre y nada más**. Rellenarlos es trabajo de una persona.

---
## Los cuatro correos que salen a proveedores

Uno por cada cosa que hay que pedirle a alguien de fuera, y cada uno en el
momento en que esa cosa hace falta:

| Cuándo | A quién | Qué pide |
|---|---|---|
| Con el depósito dentro | El vendedor alemán | Si el coche **sigue disponible** y cuándo podemos verlo |
| Al liberar el pago | El vendedor alemán | La factura del coche **a nombre del cliente** |
| En el tramo de transporte | El transportista | La recogida, con las dos puntas y desde cuándo |
| Al entrar en trámites | La gestoría | Los tres papeleos y **el importe real del impuesto** |

Los cuatro **se enseñan antes de salir**. Ninguno se manda de un clic: se abre el
correo entero, se revisa y se manda. Un correo no se desenvía, y estos van a
gente de fuera con nuestro nombre.

De cada uno se puede cambiar **a quién va**, **el asunto** y **añadir una línea**
de ese coche en concreto. El cuerpo se ve pero no se edita, y eso es a
propósito: cada correo existe por una frase —«a nombre del cliente, no de
PopCar», «preguntar por» en cada punta, «decidnos el importe real del
impuesto»— y un cuadro de texto con todo el HTML dentro es la forma más fácil
de que un día se borre una de ellas sin querer y el correo salga pareciendo el
de siempre.

Y ninguno se manda a ciegas: si falta el correo del proveedor, o el NIF del
cliente, o el transportista, se dice qué falta y dónde se rellena en lugar de
mandar algo que vuelve mal.

> **Todavía no son automáticos, y es una decisión.** Con cuatro coches al mes,
> un correo revisado vale lo mismo que uno que sale solo y no se arriesga a lo
> que el automático sí: salir con un dato mal puesto. Cuando alguno haya salido
> igual cien veces, ese se automatiza.

---
## La garantía

**No la damos nosotros.** No le vendemos el coche —se lo vende el concesionario
alemán— así que no se la debemos. Lo que ofrecemos es una garantía mecánica de
un tercero, elegida para el tipo de coche que se lleva.

Ninguna es obligatoria, pero **el precio publicado lleva una puesta**: la más
barata que se le pueda dar a ese coche. En la ficha se puede quitar, y entonces
el precio **baja**.

Eso no es un truco: es el mismo dinero leído del derecho. Un coche que se anuncia
a 21.310 € y luego ofrece una garantía por 190 € parece que sube de precio al
final. Anunciado a 21.500 € con la garantía dentro, quitarla es una rebaja. Y lo
que ve en la lista es lo que le vamos a pedir, que era el problema de fondo.

Por eso los botones de la ficha dicen **lo que le mueve al total** y no lo que
vale cada producto: «va en el precio» la que ya está puesta, «+300 €» una más
larga, «−190 €» quitarla. El desglose de debajo sí pone su importe entero, como
las demás partidas.

Y sube el precio **coche a coche**: a uno al que no se le pueda dar ninguna no se
le suma nada. Por eso la lista se ordena y la horquilla corta con esa cuenta
dentro de la consulta, y no con una cifra fija.

### Lo que de verdad se vende aquí

El concesionario alemán le debe la garantía legal europea de dos años. El
problema no es tenerla: **es usarla**. Un particular que compra una vez en
Alemania no tiene forma de presionar a un concesionario de otro país, en otro
idioma y con otro derecho de consumo.

Nosotros traemos coches todas las semanas y hablamos con esa gente todas las
semanas. **Si hay que reclamar, reclamamos nosotros.** Eso no cabe en el precio
de un producto, así que se dice con palabras, en la ficha y por teléfono.

Es el argumento más fuerte que hay y conviene usarlo al llamar.

### Dos cosas que hace sola la pantalla

- **No ofrece una garantía que a ese coche no se le pueda dar.** Cada producto
  tiene tope de antigüedad y de kilómetros; si no encaja, no aparece. Enseñar una
  opción que luego se cae es peor que no enseñarla, porque el cliente ya contó
  con ella.
- **El precio lo calcula el servidor.** El navegador dice cuál quiere, no cuánto
  cuesta. Si llega una que no le corresponde —o no llega ninguna— se cobra la de
  por defecto, no cero: cero sería cobrarle menos de lo que se le enseñó y
  entregarle un coche sin la garantía que estaba viendo. Para no llevar ninguna
  hay que decirlo, y eso es lo que hace el botón «Sin garantía».

Cada garantía **cuelga de un proveedor** de Proveedores, del tipo *Garantías*. No
se puede guardar una apuntando a alguien que no esté dado de alta: el día que
haya que reclamarla, lo primero que se busca es a quién.

> **Pendiente:** los tres productos que hay cargados tienen precios inventados
> para poder ver la pantalla. Hacen falta los de la aseguradora.
>
> Y una cosa más, ahora que la de por defecto entra en el precio: **la de doce
> meses no tiene topes**, así que hoy se le ofrece a cualquier coche, tenga la
> edad y los kilómetros que tenga. Las de 24 y 36 sí los tienen. Cuando lleguen
> los productos de verdad hay que ponerle los suyos.

### Y en la entrega

El documento de entrega **no pone una garantía de PopCar**, porque no la damos.
Pone lo que hay:

| Si el cliente… | El documento dice |
|---|---|
| **No contrató garantía** | Que la legal de dos años la debe el vendedor alemán, y que si hay que reclamar lo hacemos nosotros. **Sin fecha de fin nuestra** |
| **Sí contrató** | El nombre del producto, sus meses y su fecha de fin. Y que reclamamos nosotros |

Esa última frase está en los dos casos a propósito: la póliza la puede vender
cualquiera, **lo que le ahorra la discusión en alemán somos nosotros**.

Lo que **tampoco** entra en el precio: el **reacondicionado**, que solo se sabe
cuando el coche llega y se le presupuesta antes, y el **seguro**.
## Dónde se lo llevamos

En la ficha del coche, debajo del desglose, hay una sección de **El viaje,
incluido en el precio**, con sus tres puntos:

| | De dónde sale |
|---|---|
| **Desde** | La ciudad alemana donde está el coche, sacada de la propia oferta |
| **Pasa por** | Zaragoza, donde se homologa y se prepara |
| **Hasta** | La dirección del cliente, entre comillas, con calle y código postal |

**La parada de Zaragoza se le dice, y se le dice para qué.** El coche no puede ir
de Alemania a su casa de un tirón: tiene que pasar la ITV de homologación antes
de matricularse. Sin esa línea, tres semanas de espera no se entienden. Zaragoza
y no Madrid porque ahí está la ITV que homologa y porque queda a media distancia
de Madrid, Barcelona, Valencia y Bilbao.

**Los dos tramos van en el precio.** Que por dentro sean dos camiones distintos
—o el mismo conductor, si se trae rodando— es cosa nuestra. Él compró un viaje.

**Un precio para toda la península.** El transporte va dentro del precio y no
cambia si vive en Cádiz o en Girona. Fuera de la península —Baleares, Canarias,
Ceuta y Melilla— sale un aviso de que **puede** llevar recargo, sin cifra: no hay
tarifa de nadie para esos viajes y poner un número sería adivinar. Se le confirma
antes de que pague.

**La dirección se la rellenamos.** Si tiene una puesta en sus datos de
facturación, sale ya escrita: volver a pedírsela es preguntarle algo que ya nos
dijo. Debajo hay **Cambiar dirección de envío** por si quiere recibirlo en otro
sitio, y lo que escriba se recuerda entre coches — quien compara cinco no la
escribe cinco veces.

**Se puede cambiar hasta que deposita el dinero. Después no.** Lo que depositó
incluye llevárselo a donde dijo; dejarle cambiarla luego sería dejarle pagar
precio de península y pedir la entrega en Palma. Al intentarlo se le dice que
escriba, no un «no se puede» a secas. Si hay que cambiarla igualmente, se hace
desde el ERP.

También la puede poner o cambiar **desde su panel**, en la tarjeta de la
solicitud, con las mismas reglas.

## Lo que se contrata aparte

Debajo del viaje hay un bloque, **«Si quieres, aparte»**, con dos cosas que se
marcan una a una:

| Servicio | Qué es |
|---|---|
| **Seguro** | Póliza para que pueda circular el mismo día que lo reciba |
| **Reacondicionamiento** | Lo que necesite al llegar: neumáticos, frenos, chapa |

Tres reglas que conviene tener claras porque explican lo que se ve:

- **Ninguno tiene precio todavía.** Salen como «a consultar». El seguro no lo
  tendrá hasta que haya correduría, y el reacondicionamiento **no lo puede tener
  nunca antes de que el coche llegue a la campa y se mire**. Un cero diría que es
  gratis; «a consultar» dice lo que es.
- **Lo que no tiene precio no suma.** No se puede sumar lo que no se sabe.
- **Ninguno entra en el depósito.** El depósito es el coche y nuestro servicio; el
  coche en Alemania. Cobrarle por adelantado un seguro que todavía no tiene sería
  otra cosa.

Lo que marque llega al expediente, para que quien le llame sepa de qué hablarle.

**La entrega en su casa no está aquí**, y es a propósito: va dentro del precio.

## Cuándo le hemos dicho que lo tendrá

**Hasta que no se hace el pedido a Alemania no hay fecha que dar.** El campo no
se deja rellenar antes: ponerla es inventársela, y de ahí sale un correo al
cliente con una fecha que nadie ha confirmado.

Cuando el pedido está hecho, la fecha se pone en la ficha y sirve para dos cosas:
que todos digan lo mismo cuando llame, y que **si cambia se le avise solo**.

Al cambiarla, al cliente le llega un correo con **las dos fechas** —la que era y
la que es— y lo que hayas escrito en la respuesta. Si no escribes nada, el correo
le explica que es una estimación y que los plazos se mueven.

La primera vez que se pone **no se manda nada**: esa se la cuentas tú al llamar.
Solo se avisa de los cambios.

Y en su panel la ve siempre: «Lo esperamos para el 14 de octubre».

## Qué se hace con una solicitud

Una importación tiene **sus propios pasos**, porque el coche tarda semanas en
llegar y entre «le he llamado» y «lo tiene» pasan cosas que hay que distinguir.

| Paso | Qué quiere decir |
|---|---|
| Pendiente | Nadie le ha llamado todavía |
| Contactado | Ya se ha hablado con él y conoce el proceso |
| Depósito retenido | Ha pagado y tiene su factura. Ya se puede pedir el coche |
| Verificado y pagado | Se ha hecho el pedido. Aquí es cuando dan fecha |
| En transporte | Viene de camino |
| En trámites | Está aquí: aduana, ITV y matriculación |
| Entregado | Lo tiene |
| Descartado · Cancelado | No sigue adelante |

**El paso se elige en el expediente, y el cliente lo ve en su panel** con una
barra de avance y una frase que le explica qué significa. Ese es el objetivo: que
no tenga que llamar para saber por dónde va.

Hay un botón para pasarlo al siguiente, que es lo que se hace casi siempre, y el
desplegable para cualquier otro.

**Cambiar de etapa pide decir qué ha pasado.** Al pulsar sale un recuadro y hasta
que no escribes algo no se guarda. Eso se apunta en las notas internas con la
fecha y el salto delante:

```
[30 ago 2026 · Pendiente → Contactado] Le he llamado, entiende el proceso y se
lo piensa esta semana.
```

No es burocracia: el historial ya guarda **quién** lo movió y **cuándo**, pero no
lo que pasó, y eso es justo lo que necesita el siguiente que coja el teléfono. Un
expediente que va cambiando de etapa sin una línea de por qué no se puede
atender: alguien va a tener que volver a llamar para enterarse de lo que ya
sabías tú.

Se añade a lo que ya hubiera. Las notas de un expediente son un cuaderno, no un
campo que se pisa.

Cada cambio queda además en el **historial**, abajo del expediente, con quién lo
hizo y cuándo.

**Guardar y avisar al cliente** le manda un correo con lo que hayas escrito y con
su depósito. Al avisarle, un expediente que estuviera Pendiente pasa a Contactado
solo. Las **notas internas**, debajo, no salen: son para el equipo, y tienen su
botón de guardar —cuando está guardado, lo dice.

## Lo que hay que saber

**Estos son todos los correos que salen solos.** Ninguno más:

| Cuándo | Qué recibe |
|---|---|
| Al pedirla | Su solicitud, con lo que deposita y cuándo se libera |
| Al liberar el pago | Que hemos visto el coche y lo hemos comprado en su nombre |
| Al darle a **Notificar** | Lo que hayas escrito, con su depósito |
| Si **cambias** la fecha de entrega | Las dos fechas, la que era y la que es |
| Al marcarlo **Entregado** | Que ya es suyo, con lo que hayas escrito en la respuesta |
| Si se le **devuelve** el depósito | El motivo, y que vuelve entero |

Cambiar el paso **no manda ningún correo**, salvo el último: entregarlo sí se le dice. El resto lo ve en su panel
cuando entre. Si quieres que se entere ya, llámale o usa Notificar.

**Si quedas con él para entregarle el coche**, pon el día en «Día de la entrega»,
dentro del expediente. Recibe los avisos de la víspera y del mismo día, igual que
en una visita, y el expediente **no se mueve de su etapa**: sigue donde estaba
hasta que lo marques como entregado.

**El coche está en Alemania.** Todo lo que se le diga de plazos es una promesa
que hay que poder cumplir: no la hace el sistema, la haces tú al llamar.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Las solicitudes de importación | **Importaciones**, repartidas por etapa |
| De qué sección viene | La etiqueta **Marketplace · Importación** |
| El depósito: cifra, de quién es cada parte y si ha llegado | Al abrir el expediente, arriba, en azul |
| Marcarla cobrada a mano, o devolverla | En ese mismo recuadro |
| Pasar de etapa | Debajo, con el botón de la siguiente |
| Cuándo le hemos dicho que lo tendrá | Debajo, y solo después del pedido |
| Su teléfono, y cuándo quiere que le llamen | En el expediente, en sus dos campos |
| Escribirle, y las notas del equipo | Al final del expediente |
| Los papeles del coche | **Documentos**, en el expediente |
| El día que has quedado para entregarlo | **Día de la entrega**, en el expediente |
| Quién tocó qué y cuándo | El **historial**, lo último del expediente |
| Su factura y su rectificativa | **Facturación**, series FIA y RECT |
| El coche | El enlace del expediente abre su ficha en el marketplace |
| Cuánto dinero de clientes tenemos retenido | Arriba, en los números de la pantalla |

## Los papeles

En el expediente, debajo de las notas, hay un bloque de **Documentos**. Ahí va lo
que el coche va dejando por el camino: la factura del vendedor alemán, la ficha
técnica, el justificante del impuesto de matriculación, el permiso de
circulación.

Antes eso vivía en el correo de quien lo recibiera, y el día que esa persona no
está, el expediente no tiene nada.

Se aceptan **imágenes y PDF, hasta 3 MB**. Un ejecutable o una página web no son
documentos de un coche y se rechazan.

**Son internos: el cliente no los ve en su panel.** Lo que tenga que llegarle se
le manda. Y no se abren por una dirección suelta: hace falta estar dentro del
ERP, porque llevan matrícula, nombre y dirección de una persona.

Quitar uno lo borra también del almacén. Un papel con datos de alguien que ya
nadie mira no se queda ahí.

## Lo que ve el cliente

En su panel, la solicitud lleva una **barra de avance** con los siete pasos, el
que está y una frase que se lo explica en su idioma:

| Paso | Lo que lee |
|---|---|
| Pendiente | «Hemos recibido tu solicitud. Te llamamos para contarte el proceso.» |
| Contactado | «Ya hemos hablado contigo. El siguiente paso es hacer la transferencia a la cuenta de depósito.» |
| Depósito retenido | «Tu dinero está en la cuenta de depósito, retenido. Vamos a ver el coche en Alemania.» |
| Verificado y pagado | «Hemos visto el coche y lo hemos comprado en tu nombre. En cuanto nos confirmen fechas, te las decimos.» |
| En transporte | «Está de camino a España.» |
| En trámites | «Ya está aquí: ITV de homologación y matriculación para que puedas usarlo.» |
| Entregado | «Es tuyo y lo tienes contigo.» |

Debajo va el dinero y la fecha, según toque:

- Si **no ha depositado**: los pasos explicados y la cifra, con la nota de que va
  por transferencia, de que **los datos de la cuenta se los das tú al llamarle** y
  de que el dinero no lo cobra nadie hasta que vemos el coche.
- Si **ha depositado**: «Depósito retenido el 12 de septiembre».
- Si hay **fecha de entrega**: «Lo esperamos para el 14 de octubre», dicho como lo
  que es, una estimación.

**No** ve calendario ni hora: no hay ninguna, salvo que quedes con él y la pongas.

En el **resumen** de su panel, además, le sale la importación en marcha con la
etapa en la que va —o «pendiente de depósito» con la cifra, si todavía no ha
transferido—, delante de su garaje. Es lo más largo que tiene abierto con
nosotros.

Cada vez que cambias el paso, lo ve la próxima vez que abra su panel. Ese es el
trato: si lo ve, no llama.
