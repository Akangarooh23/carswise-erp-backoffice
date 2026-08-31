# Marketplace VO — Importación

Un cliente pide un coche de la sección **Importación**: coches que están en
Alemania y que traemos nosotros. Hoy hay 1.568 publicados.

**Aquí no hay visita.** No se puede ver un coche que está en Alemania, así que
no hay calendario ni horas que confirmar: el cliente pide que se lo traigamos y
alguien le llama. Por eso este flujo **no vive en la Agenda, sino en
Importaciones**, su propia sección del menú.

Es lo que más lo diferencia de las otras dos secciones, y por eso este manual es
corto: no hay que aprobar nada, hay que llamar.

## Lo que cambia respecto a un coche de aquí

| | Concesionario y Ex-Renting | Importación |
|---|---|---|
| Qué pide el cliente | Una **visita**, con día y hora | Que **le traigamos** el coche |
| Dónde aparece | **Agenda** | **Importaciones** |
| Hay que aprobar | Sí, siempre | No: hay que llamar |
| Dinero por delante | No | **Una fianza del 30 %** |
| Cuándo lo ve | En días | En semanas: hay que traerlo |

---

## La pantalla de Importaciones

Una columna por etapa, y cada columna dice qué toca hacer con esos coches. Se
lee de izquierda a derecha: lo de la izquierda es lo que está empezando.

| Columna | Qué toca |
|---|---|
| Pendiente | Llamar y explicarle el proceso |
| Contactado | Esperando a que pague la fianza |
| Fianza pagada | Hacer el pedido a Alemania |
| Pedido a Alemania | Confirmar fecha y organizar el transporte |
| En transporte | El coche viene de camino |
| En trámites | Impuesto, ITV y matrícula |
| Entregado | Cerrado |

Arriba hay cuatro números. El que importa es **Fianzas cobradas**: es dinero de
clientes que tenemos y de coches que todavía no hemos entregado.

Al pulsar un coche se abre su expediente con todo lo que se puede hacer: marcar
la fianza, pasarlo de etapa, poner la fecha de entrega y devolver la fianza. Un
expediente que lleva más de una semana parado lo dice en rojo en su tarjeta.

Dos cosas que la pantalla no te deja hacer, a propósito:

- **Pasar a «Pedido a Alemania» sin la fianza cobrada.** Pedir el coche nos
  compromete con dinero; lo que cubre eso es la fianza.
- **Poner fecha de entrega antes del pedido.** La fecha la da el vendedor al
  aceptarlo. Antes de eso cualquier fecha es inventada, y el cliente la ve en su
  panel como una promesa.

---

## Cómo va

:::flujo
cliente: Entra en **Marketplace VO**, pestaña **Importación**, y abre un coche
cliente: Pulsa **Solicitar importación** y deja nombre, correo, teléfono y su mensaje
sistema: Le dice **cuánto es la fianza**: el 30 % del precio con el coste de traerlo
correo: **Al cliente** — su solicitud, con esa cifra · **A operaciones** — solicitud nueva
erp: Sale en **Importaciones**, en la columna **Pendiente**, con su fianza
trabajador: Le llama, le cuenta el proceso y le dice que pague la fianza desde su panel
cliente: **Paga la fianza** con tarjeta, desde su solicitud
sistema: Fianza cobrada, expediente a **Fianza pagada** y **su factura emitida**. Sin tocar nada
trabajador: Hace el **pedido a Alemania** y pone el paso. Ahí es cuando hay fecha
trabajador: Escribe **cuándo lo tendrá**. Si luego cambia, al cliente se le avisa solo
? ¿Sigue adelante?
rama Sí | En transporte → En trámites | Se va poniendo el paso: él lo ve en su panel sin llamar
rama No | Devolver la fianza | Se le devuelve el cargo, sale su rectificativa y se le escribe
trabajador: Cuando lo tiene, **Entregado**
:::

## La fianza

Es lo primero que hay que mirar al abrir un expediente, y sale arriba del todo.

**Es la que se le dijo, no la que saldría hoy.** Se guarda en el momento de
pedirlo: si el precio del anuncio cambia después, o el coche deja de estar
publicado, la suya sigue siendo la que se le prometió. Nunca se recalcula.

Es el **30 % del precio puesto aquí**, con todo lo que lleva dentro. Con los
precios de hoy son unos 2.900 € de media.

Si el cliente elige otra garantía, cambia el total y cambia la fianza. La que
vale es la del momento en que la pidió.

Si alguien discute la cifra, la que vale es la que pone ahí.

**Es lo primero que se cobra, y hasta que no está no se pide nada a Alemania.**

El orden es este y no otro:

1. Se cobra la fianza y se le emite factura.
2. Con eso hecho, se hace el pedido a Alemania.
3. Al pedirlo dan fecha, y esa es la que se le dice al cliente.
4. Cuando llega, los trámites para que pueda usarlo aquí.

**La paga él, desde su panel, con tarjeta.** En su solicitud le sale el botón con
la cifra. Al pagar pasan tres cosas solas: la fianza queda cobrada, el expediente
avanza a «Fianza pagada» y **se le emite su factura**, con serie propia. No hay
que hacer nada en el ERP.

Antes del botón lee **los cinco pasos**: paga la fianza, pedido a Alemania,
transporte, trámites y entrega. Son los mismos que verá marcarse en su panel, así
que cuando le llames ya sabe de qué le hablas.

Que la fianza quede cobrada **no depende de un solo aviso**. Se anota por dos
caminos —el que manda Stripe y el que pregunta la propia pantalla al volver del
pago—, y solo cuenta el primero que llegue: nunca salen dos facturas por el mismo
cobro. Si alguna vez alguien dice que ha pagado y su expediente no lo refleja,
compruébalo en Stripe **con el modo de prueba encendido**: un pago con tarjeta de
prueba no se ve en la vista normal.

Para que pueda pagar necesita **NIF y dirección** en su perfil: sin eso no se
puede emitir la factura, y el propio botón se lo dice.

Si la paga por transferencia o fuera de la web, entonces sí se **marca a mano**
desde su ficha; y si se marcó por error, se quita desde el mismo sitio.

### Si hay que devolverla

**Devolver la fianza**, en su ficha. Pide un motivo, que es lo que se le cuenta al
cliente, y hace tres cosas: devuelve el cargo en la tarjeta, emite su **factura
rectificativa** y le escribe.

Si algo falla al devolver, no se marca nada: un expediente que dice «devuelta»
con el dinero todavía dentro es peor que un error en pantalla. En ese caso la
pantalla lo dice y se puede devolver desde Stripe a mano.

El cobro y la devolución **quedan los dos**, cada uno con su fecha y su factura.
No se borra lo que pasó.

## De qué se compone el precio

Un coche de importación cuesta más que su anuncio alemán, y al cliente se le
enseña por qué. En la ficha salen tres líneas y un total:

| Línea | Qué lleva |
|---|---|
| **Precio del coche** | Lo que cuesta en Alemania **más lo que gana PopCar** |
| **Transporte desde Alemania** | Un coche por pedido |
| **Matriculación y papeleo** | Los trámites y el impuesto de matriculación |
| **Puesto en tu casa** | La suma |

El margen va **dentro del precio del coche**, no en una línea suya. Nadie
desglosa lo que gana quien le vende, y sacarlo aparte solo invita a discutirlo.
Lo que sí se separa es lo que el cliente reconoce como un servicio.

Va por tramos del coste: 1.000 € en un coche de hasta 10.000, y subiendo hasta
2.500 € a partir de 30.000; por encima de 40.000, un 6 %. Por tramos y no por
porcentaje porque traer un coche de 6.000 € y uno de 25.000 € da casi el mismo
trabajo.

**Dos números siguen siendo estimaciones**, y conviene saberlo antes de
prometerle nada a nadie:

- El **transporte** es lo que esperamos pagar mientras no haya tarifas cerradas
  con los transportistas. En cuanto un corredor tenga tarifa, manda la tarifa.
- El **impuesto de matriculación** se aproxima con una de las cuatro bandas de
  CO₂ sobre el precio español de coches comparables. No se puede calcular bien
  todavía: ninguna oferta alemana trae el CO₂. Se equivoca hacia arriba a
  propósito — en un precio público, pasarse es recuperable y quedarse corto es
  una promesa que no se puede cumplir.

## La garantía

La **base va dentro del precio** y sale en el desglose como «incluida». Debajo,
el cliente puede elegir otra: se le enseña **la diferencia** con la base, no el
precio entero. Sumar o restar sobre un total que ya ha visto se entiende;
recalcularlo entero delante, no.

Tres cosas que hace sola la pantalla, y que conviene conocer porque explican
huecos que si no parecen fallos:

- **No ofrece una garantía que a ese coche no se le pueda dar.** Cada producto
  tiene tope de antigüedad y de kilómetros. Con la media del catálogo en doce
  años, en muchos coches solo saldrán las básicas.
- **«Sin garantía» solo aparece si la base es renunciable.** Si la base es el
  mínimo legal no se puede quitar, y ofrecerlo sería ofrecer lo que no se puede
  cumplir.
- **El precio lo calcula el servidor.** Si llega una garantía que no le
  corresponde, se cae a la base en vez de aceptarla.

Cada garantía **cuelga de un proveedor** de Proveedores, del tipo *Garantías*.
No se puede guardar una apuntando a alguien que no esté dado de alta: el día que
haya que reclamarla, lo primero que se busca es a quién. Si la dais vosotros, va
sin proveedor.

Lo que **no** entra en el precio y se factura aparte: el **reacondicionado**, que
solo se sabe cuando el coche llega y se le presupuesta antes, y el **seguro**.

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
| Fianza pagada | Ha pagado y tiene su factura. Ya se puede pedir el coche |
| Pedido a Alemania | Se ha hecho el pedido. Aquí es cuando dan fecha |
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
su fianza. Al avisarle, un expediente que estuviera Pendiente pasa a Contactado
solo. Las **notas internas**, debajo, no salen: son para el equipo, y tienen su
botón de guardar —cuando está guardado, lo dice.

## Lo que hay que saber

**Estos son todos los correos que salen solos.** Ninguno más:

| Cuándo | Qué recibe |
|---|---|
| Al pedirla | Su solicitud, con la fianza |
| Al pagar la fianza | Su factura queda emitida y la tiene en Facturación |
| Al darle a **Notificar** | Lo que hayas escrito, con su fianza |
| Si **cambias** la fecha de entrega | Las dos fechas, la que era y la que es |
| Al marcarlo **Entregado** | Que ya es suyo, con lo que hayas escrito en la respuesta |
| Si se le **devuelve** la fianza | El motivo y su factura rectificativa |

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
| La fianza: cifra, si está cobrada y desde cuándo | Al abrir el expediente, arriba, en azul |
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
| Cuánto dinero de clientes tenemos sin entregar | Arriba, **Fianzas cobradas** |

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
| Contactado | «Ya hemos hablado contigo. El siguiente paso es pagar la fianza.» |
| Fianza pagada | «Fianza recibida y factura emitida. Vamos a pedir tu coche.» |
| Pedido a Alemania | «Pedido hecho. En cuanto nos confirmen fechas, te las decimos.» |
| En transporte | «Está de camino a España.» |
| En trámites | «Ya está aquí: aduana, ITV y matriculación para que puedas usarlo.» |
| Entregado | «Es tuyo y lo tienes contigo.» |

Debajo va el dinero y la fecha, según toque:

- Si **no ha pagado**: los cinco pasos explicados, la cifra y el botón **«Pagar la
  fianza»**, con la nota de que se le emite factura y de que se devuelve si no se
  hace el pedido.
- Si **ha pagado**: «Fianza pagada el 12 de septiembre» y que tiene su factura en
  Facturación.
- Si hay **fecha de entrega**: «Lo esperamos para el 14 de octubre», dicho como lo
  que es, una estimación.

**No** ve calendario ni hora: no hay ninguna, salvo que quedes con él y la pongas.

En el **resumen** de su panel, además, le sale la importación en marcha con la
etapa en la que va —o «pendiente de fianza» con la cifra, si todavía no la ha
pagado—, delante de su garaje. Es lo más largo que tiene abierto con nosotros.

Cada vez que cambias el paso, lo ve la próxima vez que abra su panel. Ese es el
trato: si lo ve, no llama.
