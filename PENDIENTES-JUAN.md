# Pendientes de Juan

Esto es para el asesor. No es un pendiente de trabajo nuestro: es la lista de
**cosas que hemos hecho de una manera y no sabemos si es la correcta**, y de
preguntas que han ido saliendo al montar la importación y que nadie de dentro
puede contestar.

Va con un caso real entero, de principio a fin: el primer coche importado. Es
mejor que preguntarlo en abstracto, porque casi todas las dudas son de encaje y
el encaje depende de los papeles concretos que hay encima de la mesa.

**Lo que pedimos**: que lo mires caso por caso y contestes lo de cada apartado.
Donde digamos «hoy lo hacemos así», si está mal, dilo y lo cambiamos. Donde
preguntemos, la respuesta se convierte en cómo lo hace el sistema a partir de
entonces — esto no es teoría, es lo que va a quedar programado.

**Aún no hay clientes de verdad.** El expediente que sigue es una prueba
completa hecha con datos reales de proveedores reales, pero el cliente somos
nosotros. Estamos a tiempo de cambiar cualquier cosa sin rectificar nada.

> Escrito el 5 de septiembre de 2026, al terminar la primera importación de
> punta a punta.

---

## 0 · El caso, entero

**Kia Sorento 2.4 GDI AWD, gasolina, 175 CV, 2020, 63.000 km.** Comprado en un
concesionario de Múnich, matriculado en España el 3 de septiembre y entregado en
Madrid. Expediente `PED-2026-001`, matrícula 8181APH.

**El modelo de negocio, que es de donde sale casi todo lo demás:** PopCar **no
compra el coche**. El coche se lo vende el concesionario alemán directamente al
cliente español, y el coche está a su nombre desde el principio. Nosotros
cobramos un fee por el servicio: buscarlo, verlo allí en persona, traerlo,
homologarlo, matricularlo y entregarlo.

### Lo que pagó el cliente

| Concepto | Importe | Cómo lo tratamos hoy |
|---|---|---|
| Precio del coche (vendedor alemán) | 16.890,00 € | Suplido |
| **Servicio PopCar** | **3.000,00 €** | **Nuestra factura, IVA incluido** |
| Impuesto de matriculación, a cuenta | 1.420,00 € | Suplido, provisión estimada |
| Garantía mecánica, 12 meses | 190,00 € | Suplido |
| **Total** | **21.500,00 €** | |

La factura al cliente es la **SRV-2026-0001**, de 3.000 €. En el PDF sale
partida en 2.479,34 € de base y 520,66 € de IVA, y los otros tres conceptos van
listados debajo del cuadro del total, bajo el epígrafe SUPLIDOS, con la leyenda
«pagados en tu nombre, no son ingreso de PopCar y van fuera de la base
imponible».

### Lo que hemos pagado nosotros

| Proveedor | NIF | Concepto | Importe | Estado |
|---|---|---|---|---|
| Autowelt Kaufmann GmbH | DE292167635 | El coche | 16.890,00 € | Factura ACD-2026-0903-001, pagada |
| checkdenwagen Automobile DE | *no lo tenemos* | Inspección previa en Alemania | 289,00 € | Pagada |
| Business Ontime GmbH | DE307265811 | Transporte Múnich → Zaragoza | 890,00 € | Factura pendiente |
| Becker Solutions, S.L. | ESB88835145 | Transporte Zaragoza → Madrid | 400,00 € | Factura pendiente |
| Gestoría Bernal | *no lo tenemos* | Matriculación: honorarios, tasas e impuesto | 2.744,00 € | Factura de 253 € pendiente |
| Proveedor de la garantía | — | Garantía mecánica 12 meses | 120,00 € | Sin factura |

**El impuesto de matriculación real fueron 2.491,00 €** y le habíamos cobrado
1.420,00 €. La diferencia, **1.071,00 €**, decidimos no reclamársela: ya le
habíamos dado un precio y pedirle mil euros más con el coche entregado nos
parecía quedar mal. La absorbimos contra el margen.

---

## 1 · Qué es PopCar en esta operación — **la pregunta de la que cuelgan las demás**

Todo lo que sigue cambia según cómo se conteste esta.

**Cómo lo hacemos hoy**: nos comportamos como **mediador en nombre y por cuenta
del cliente**. El coche se factura a su nombre, el impuesto se paga a su nombre,
y de todo eso nosotros solo facturamos nuestro servicio: 3.000 €. Lo demás pasa
por nuestra cuenta pero no es nuestro ingreso.

**La duda**: el cliente contrata **con nosotros**, en nuestra web, y ve un
precio único de 21.500 €. No firma nada con el concesionario alemán: nosotros le
enseñamos el coche, negociamos y pagamos. Un inspector puede leer eso como que
actuamos **en nombre propio**, y entonces —artículo 11.dos.15.º de la Ley del
IVA— se entiende que recibimos y prestamos el servicio nosotros, y la
facturación no sería 3.000 € sino bastante más.

### Lo que necesitamos que nos digas

- ¿Somos mediador en nombre ajeno o comisionista en nombre propio, con los
  papeles que hay hoy? ¿Y qué papel falta para que sea indiscutible?
- ¿Hace falta un **mandato expreso y firmado** del cliente para pagar en su
  nombre? Si sí, danos el texto y lo metemos en la contratación de la web: hoy
  no existe.
- ¿Cambia algo el que el coche esté **a su nombre desde el principio** y nunca
  pase por el nuestro? Nosotros creemos que es lo que sostiene todo lo demás.
- Si la respuesta fuera «nombre propio», ¿qué habría que cambiar? Nos interesa
  saber el coste de esa respuesta antes que la respuesta.

---

## 2 · El fee de 3.000 € — ¿con el IVA dentro o fuera?

**Cómo lo hacemos hoy**: con el IVA dentro. El cliente ve 3.000 € y la factura
los parte en 2.479,34 + 520,66.

**El problema**: nadie decidió eso. Se puso 3.000 en la web y el generador de
facturas divide por 1,21 porque es lo que hacía con las facturas de tasación.
Y no es un detalle de céntimos: son 520,66 € por coche, que es casi la mitad de
lo que ganamos.

**Y hay una incoherencia dentro del sistema**: el ERP calcula el margen restando
al fee **completo** unos costes que sí están **sin IVA**. Es decir, hoy cuenta
3.000 € de ingreso contra costes netos. Si el fee lleva el IVA dentro, el
ingreso real es 2.479,34 € y el margen de este coche cambia de signo — está en
el apartado 12.

### Lo que necesitamos que nos digas

- ¿El precio al público de un servicio a particulares tiene que anunciarse con
  el IVA incluido? Damos por hecho que sí, pero queremos que lo confirmes por
  escrito porque de ahí sale el precio de toda la web.
- ¿El tipo es el 21 %? Es un servicio de intermediación y gestión a un
  particular residente, así que entendemos que sí.
- Si mañana un cliente es **empresa con NIF-IVA de otro país de la UE**, ¿la
  factura va sin IVA por inversión del sujeto pasivo? Hoy el sistema no lo
  contempla: le pondría el 21 % igual.

---

## 3 · Los suplidos, uno por uno

Es donde más miedo tenemos, porque un suplido mal puesto no es un error de
clasificación: es base imponible que no se declaró.

Los tres requisitos que conocemos son que el gasto se pague **en nombre y por
cuenta del cliente**, con **factura a su nombre**, por el **importe exacto** y
con **mandato previo**. Queremos que nos confirmes la lista y que nos digas si
nos falta alguno.

### 3.1 · El coche: 16.890 €

**Cómo lo hacemos hoy**: suplido. La factura del concesionario alemán,
ACD-2026-0903-001, va a nombre del cliente. Nosotros pagamos y se lo repercutimos
al céntimo. No deducimos nada de ella.

- ¿Es correcto? Es, con diferencia, el importe más grande y el que más nos
  preocupa.
- ¿Tenemos que **conservar nosotros** esa factura, o basta con que la tenga él?
  Hoy la guardamos y se la damos.
- ¿Aparece ese importe en algún modelo nuestro —347, por ejemplo— aunque no sea
  ingreso?

### 3.2 · El impuesto de matriculación: 1.420 € cobrados, 2.491 € reales

Va en el apartado 4, que es largo.

### 3.3 · La garantía: 190 € — **aquí sabemos que hay algo mal**

**Cómo lo hacemos hoy**: se la cobramos como suplido, 190 €.

**El problema**: en el catálogo, esa garantía tiene **precio 190 € y coste
120 €**. O sea que no estamos pagando 190 € en su nombre: estamos pagando 120 y
cobrando 190. Eso no es un suplido por definición, y son 70 € de margen
escondidos dentro de una línea que dice «pagado en tu nombre».

Y hay una segunda cosa: el proveedor de esa garantía está dado de alta en el
sistema como «PopCar (garantía propia)». Nos dicen que la garantía la da un
tercero, no nosotros. Si de verdad la damos nosotros, es venta nuestra y hay
una discusión distinta —una garantía que damos nosotros es un servicio que
prestamos, y hay que provisionar lo que pueda costar.

- Con margen de por medio, ¿esos 190 € son **ingreso nuestro con IVA** y los 120
  un coste? Es lo que nos parece a nosotros.
- Si quisiéramos que fuera suplido de verdad, ¿bastaría con que el proveedor
  **facture directamente al cliente** los 190 y nos pague a nosotros una
  comisión aparte de 70? ¿O eso trae otros problemas?
- ¿Cambia algo el que sea un producto de seguro? ¿Lleva IVA, o va por el
  impuesto sobre primas de seguros? Si es lo segundo, ¿podemos venderlo nosotros
  sin ser mediadores de seguros?
- Detalle feo: esos 190 € se cobraron y **no se facturaron nunca**. Sea suplido
  o sea venta, algo tenía que haberse emitido. ¿Qué, y con qué fecha?

---

## 4 · El impuesto de matriculación — provisión, liquidación y diferencia

Este es el apartado con más preguntas y el que más dinero mueve.

**Cómo lo hacemos hoy:**

1. Al contratar, le cobramos una **estimación** del impuesto: 1.420 €. En la web
   se le dice explícitamente que es **a cuenta** y que se liquida al matricular.
2. Ese dinero se queda apartado hasta que la gestoría presenta el 576.
3. El impuesto real fueron **2.491 €**.
4. Faltaban 1.071 €. Decidimos **no cobrárselos** y ponerlos nosotros.

El ERP tiene los tres caminos programados —«se lo he cobrado», «se lo he
devuelto» y «lo ponemos nosotros»— porque no sabíamos cuál era el correcto.

### Lo que necesitamos que nos digas

- **El sujeto pasivo del impuesto es el cliente**, entendemos, porque el coche
  se matricula a su nombre. ¿Correcto? Si lo es, cobrarlo a cuenta y pagarlo por
  él es un suplido de manual. Si no lo fuera, todo esto cambia.
- **La diferencia que asumimos, esos 1.071 €: ¿es gasto deducible para nosotros
  o es una liberalidad?** Nos preocupa que sea lo segundo: pagaríamos el dinero
  y encima no nos lo podríamos deducir.
- Si es deducible, ¿con qué documento? El recibo del 576 va a nombre del
  cliente, no al nuestro.
- **Y al revés: si sobra.** Cobramos 1.500 y el impuesto son 1.200. La
  pregunta que se hizo aquí fue si podemos quedárnoslo como margen. Nuestra
  lectura es que **no**: se cobró «a cuenta», el panel del cliente le promete la
  liquidación, y un suplido que te quedas deja de ser suplido y pasa a ser
  ingreso por servicio con su 21 %. ¿Lo ves igual?
- Si la respuesta es que no se puede, la alternativa que se nos ocurre es un
  **precio cerrado**: PopCar asume el riesgo del impuesto, lo paga de lo suyo y
  ni devuelve ni reclama. ¿Eso sí se puede? ¿Y entonces esos 1.420 € pasan a
  ser ingreso nuestro con IVA, aunque los gastemos íntegros en un impuesto?
- **La provisión en sí**: mientras el dinero está cobrado y el impuesto sin
  pagar, ¿eso es un pasivo nuestro en el balance? ¿Con qué cuenta?
- La estimación se ha corregido esta semana —antes se quedaba corta en todos los
  todocaminos grandes— y ahora se pasa un poco a propósito. Si nos vamos a
  quedar el sobrante, esa decisión técnica se vuelve una decisión fiscal. Nos
  gustaría que lo supieras antes de contestar lo anterior.

---

## 5 · El escrow — dinero de clientes en nuestra cuenta

**Cómo lo hacemos hoy**: el cliente paga los 21.500 € de una vez y ese dinero se
queda **retenido** hasta que nuestro receptivo está físicamente delante del
coche en Alemania y confirma que es el que se anunció. Entonces se libera el
pago al vendedor. Si el coche no es lo que decía el anuncio, se le devuelve.

Es la promesa central del producto: la alternativa para un particular es
transferir veinte mil euros a un desconocido de otro país y esperar.

**El detalle importante**: hoy **no hay una cuenta separada**. El dinero entra
por la pasarela de pago y está en la cuenta de la empresa. «Retenido» quiere
decir que no lo movemos, no que esté en otro sitio.

### Lo que necesitamos que nos digas

- ¿Tener dinero de clientes en la cuenta ordinaria, aunque sea unos días y
  contra un compromiso escrito, nos mete en algún régimen de **servicios de
  pago**? Es lo que más nos inquieta de todo el documento, porque si la
  respuesta es sí no es un tema contable, es una licencia.
- Si hay que separarlo, ¿vale una **cuenta de terceros** en el mismo banco, o
  hace falta un depositario?
- Mientras está retenido: ¿es ingreso, es un anticipo de clientes, o no es nada
  hasta que se libera? Hoy el sistema no lo trata como ingreso hasta que se
  factura.
- ¿Cuándo se **devenga el IVA** de nuestro fee: cuando cobra la pasarela, cuando
  liberamos el dinero, o cuando entregamos el coche? Entre lo primero y lo
  último pueden pasar seis semanas, y pueden caer en trimestres distintos.
- Si hay que devolverlo entero, ¿se rectifica la factura del servicio o no
  llegó a haberla? Hoy la factura se emite al cobrar.

---

## 6 · Las facturas que recibimos — régimen e IVA

**Cómo está hoy, y está mal**: las tres facturas recibidas de este coche están
guardadas con **régimen nacional y 21 % de IVA**, y **sin base imponible**. Dos
de las tres son alemanas.

| Factura | Proveedor | Importe | Guardado como | Lo que creemos que es |
|---|---|---|---|---|
| PROV-2026-001 | checkdenwagen Automobile DE | 289,00 € | Nacional, 21 % | ¿Intracomunitario? |
| PROV-2026-002 | Business Ontime GmbH (DE307265811) | 890,00 € | Nacional, 21 % | Intracomunitario |
| PROV-2026-003 | Gestoría Bernal | 253,00 € | Nacional, 21 % | Nacional, pero casi todo tasas |

Ya está construido el sitio donde guardar base, tipo y régimen de cada una: lo
que falta es saber qué poner.

### Lo que necesitamos que nos digas

- El transporte Múnich → Zaragoza lo hace una empresa alemana con NIF-IVA para
  un cliente español con NIF-IVA. Entendemos que es una **prestación de
  servicios intracomunitaria con inversión del sujeto pasivo**: factura sin IVA,
  autorrepercutimos y deducimos, y va en el **modelo 349**. ¿Correcto?
- ¿Estamos dados de alta en el **ROI**? No lo sabemos con seguridad y es
  condición para lo anterior. Si no lo estamos, ¿qué pasa con esta factura ya
  recibida?
- La inspección en Alemania, 289 €: es un servicio prestado allí sobre un coche
  que está allí. ¿Mismo tratamiento, o hay alguna regla especial por ser un
  servicio sobre un bien mueble?
- El transporte Zaragoza → Madrid lo hace una S.L. española: nacional con 21 %
  deducible, entendemos.
- ¿Hay algún requisito de **forma** que debamos exigir a los proveedores
  alemanes? Nos han llegado facturas sin nuestro NIF-IVA puesto.

---

## 7 · La factura de la gestoría — dónde acaba el honorario y empieza el suplido

Es el caso más enredado y el más repetitivo: va a pasar en todos los coches.

La gestoría nos pasa **2.744 €** por el expediente, desglosados así:

| Concepto | Importe | Cómo viene marcado |
|---|---|---|
| Impuesto de matriculación | 2.491,00 € | Suplido |
| Tasa Tráfico | 99,77 € | Suplido |
| Impuesto Municipal | 10,42 € | Suplido |
| Placas | 19,97 € | Suplido |
| Envío kit concesionario | 12,10 € | Suplido |
| Tasa Colegio | 6,53 € | Suplido |
| Distintivos | 5,81 € | Suplido |
| Cambio de servicio | 50,00 € | Honorario |
| Honorarios | 30,25 € | Honorario |
| Honorarios cambio de domicilio | 10,89 € | Honorario |
| Honorarios cambio de servicio | 7,26 € | Honorario |
| Honorarios exención 06 | 0,00 € | Honorario |
| **Total** | **2.744,00 €** | |

De ahí, la **factura** que nos manda es de **253 €**: todo menos el impuesto.

Tres cosas nos chirrían:

1. Los honorarios parecen venir **con el IVA dentro** —30,25 es 25 × 1,21; 7,26
   es 6 × 1,21; 10,89 es 9 × 1,21— pero el «cambio de servicio» de 50 € es
   redondo y no encaja en ese patrón.
2. Si dentro de esos 253 € hay tasas que la gestoría pagó **en nombre del
   cliente**, esos euros son suplidos suyos, y al llegar a nosotros siguen sin
   ser coste nuestro: son del cliente. Nuestro coste real serían unos 98 €.
3. Tres importes venían del PDF con **tres decimales** (6,534 · 19,965 · 5,808).
   Sospechamos que es cómo lo exporta su programa, pero no lo hemos tocado.

### Lo que necesitamos que nos digas

- De esos 253 €, ¿cuánto es coste nuestro deducible y cuánto es un suplido que
  atraviesa dos manos —la gestoría y nosotros— hasta el cliente?
- Un suplido de nuestro proveedor, ¿sigue siendo suplido cuando nosotros se lo
  repercutimos al cliente, o al pasar por nosotros se convierte en otra cosa?
- ¿Le podemos pedir a la gestoría que **facture directamente al cliente**? Nos
  ahorraría toda esta cadena, pero no sabemos si complica algo por otro lado.
- ¿Qué es la «exención 06»? Sale a cero y nadie de aquí sabe qué es.

---

## 8 · Las facturas que faltan, y cuándo llegan

**Cómo está hoy**: de este coche **faltan tres facturas** —el transporte alemán
(890 €), el transporte nacional (400 €) y la gestoría (253 €)— y una cuarta que
no existe y no sabemos si tenía que existir: la de la garantía.

La del segundo transporte es estructural: ese transportista no factura hasta
que el viaje termina, y el viaje termina **el día de la entrega**. Siempre va a
llegar después.

Hemos montado un botón que pide la factura al proveedor por correo, en tres
idiomas, y un cierre de expediente que enumera lo que falta. Lo que **no**
hicimos fue bloquear la entrega del coche hasta tener todas las facturas,
precisamente por lo anterior.

### Lo que necesitamos que nos digas

- ¿Cuál es el plazo real que podemos dar por bueno? ¿Y a partir de cuándo un
  gasto sin factura deja de ser deducible?
- Un gasto ya pagado y sin factura, ¿se contabiliza igual y se regulariza
  después, o se espera?
- ¿Nos vale un **justificante de pago** mientras tanto para algo?
- ¿Qué preferirías recibir tú: el expediente cuando está completo, o los apuntes
  según van entrando? El sistema puede hacer las dos.

---

## 9 · El IVA del coche en sí

**Cómo lo hacemos hoy**: no hacemos nada. Es una compraventa entre el
concesionario alemán y el cliente español y nosotros no intervenimos en el IVA.

Este Sorento es de 2020 y tenía 63.000 km, así que no es un medio de transporte
nuevo y damos por hecho que no hay nada que ingresar aquí.

### Lo que necesitamos que nos digas

- **¿Dónde está la raya exacta?** Sabemos que hay un criterio de antigüedad y
  otro de kilómetros. Queremos el número exacto para programarlo: si un coche
  cae dentro, el cliente tendría que ingresar el IVA español y hoy nadie se lo
  diría. Es el fallo que más caro le puede salir a un cliente.
- Si un coche cae dentro, ¿qué tiene que presentar él y con qué plazo?
  ¿Y podemos presentarlo nosotros por él?
- Los concesionarios alemanes venden unos coches por **régimen de margen** y
  otros con IVA deducible. ¿Nos importa la diferencia a nosotros, o es solo cosa
  del cliente? ¿Tenemos que dejarlo escrito en algún sitio del expediente?
- ¿Y si el cliente es una empresa española que sí quiere deducirse el IVA?
  Hoy el flujo entero está pensado para particulares.

---

## 10 · Declaraciones: qué presentamos y cuándo

**Cómo está hoy**: no lo tenemos claro, y por eso preguntamos. Lo único que
sabemos seguro es que el 576 lo presenta la gestoría por cada coche.

- **349**: ¿lo presentamos por los servicios que nos prestan las empresas
  alemanas? ¿Periodicidad?
- **347**: ¿entran los suplidos en el cómputo de los 3.005,06 €? Un solo coche
  ya lo supera de sobra por el precio del coche.
- **303**: ¿alguna casilla especial por lo intracomunitario y por los suplidos?
- **309**: ¿nos afecta alguna vez, o solo al cliente en el caso del apartado 9?
- **Facturación electrónica y Verifactu**: emitimos las facturas con un
  generador nuestro, en PDF, con numeración correlativa. ¿Cumple? ¿Y a partir de
  qué fecha nos obliga a nosotros? Preferimos saberlo ahora que hay cuatro
  facturas.

---

## 11 · Las series de facturas

**Cómo está hoy**: hay tres numeraciones vivas a la vez.

| Serie | Para qué | Ejemplo |
|---|---|---|
| `SRV-2026-XXXX` | Servicio de importación | SRV-2026-0001 |
| `FIA-2026-XXXX` | Fianzas del modelo anterior | FIA-2026-0001 |
| Numeración de la pasarela | Informes de tasación | GZNNTAHZ-0003 |

La serie de fianzas es del modelo antiguo, cuando comprábamos el coche. Ya no se
usa, pero la factura existe.

- ¿Podemos tener series separadas por producto? ¿Hace falta declararlo?
- La FIA-2026-0001 salió con **21 % de IVA sobre una fianza**. Si una fianza es
  una garantía que se devuelve, entendemos que no debería llevarlo. ¿Hay que
  rectificarla, aunque el modelo ya no se use?
- ¿Y las facturas rectificativas: serie propia?

---

## 12 · El margen — cómo lo calculamos y si está bien

**Cómo lo hacemos hoy**: ingreso menos coste, donde el ingreso es el fee y el
coste es la **base** de cada gasto nuestro, nunca el total con IVA, porque el
IVA soportado se deduce y no es coste. Los suplidos no entran por ningún lado.

Aplicado a este coche, y **suponiendo** las respuestas de los apartados
anteriores:

| | Importe |
|---|---|
| Fee cobrado | 3.000,00 € |
| Transporte Múnich → Zaragoza (intracomunitario, sin IVA dentro) | −890,00 € |
| Inspección en Alemania | −289,00 € |
| Transporte Zaragoza → Madrid (base de 400 con 21 %) | −330,58 € |
| Honorarios de la gestoría | −81,32 € |
| **Margen antes del impuesto asumido** | **1.409,10 €** |
| Diferencia del impuesto que pusimos nosotros | −1.071,00 € |
| **Margen** | **338,10 €** |

**Y si el fee lleva el IVA dentro**, el ingreso no son 3.000 sino 2.479,34, y
este coche **pierde 182,56 €**.

Ese número es la razón de este documento. No sabemos si es verdad, porque
depende de cuatro respuestas tuyas: si el fee es con IVA, si la garantía es
suplido, cuánto de la gestoría es coste nuestro y si los 1.071 € son deducibles.

- ¿El planteamiento —ingreso bruto contra costes netos— está bien, o tenemos que
  comparar netos con netos?
- ¿Los 1.071 € asumidos van al coste de **este** coche o a un gasto general?
  Nosotros los hemos puesto en este coche a propósito: si no, un coche que nos
  costó dinero parece igual de rentable que uno que cuadró.
- ¿Hay algo más que estemos contando como margen y no lo sea?

---

## 13 · Lo que te podemos mandar solo

Hay una sección de Contabilidad en el ERP que saca, de un periodo, todas las
facturas emitidas y recibidas con su base, su cuota y su régimen, separando lo
intracomunitario y los suplidos, en un fichero para cargar sin teclear.

**El ERP no lleva la contabilidad ni queremos que la lleve**: los libros son
tuyos y con tu programa. Esto es solo el puente, para que nadie te mande un
correo con PDF sueltos.

- ¿En qué **formato** lo quieres? Hoy sale un CSV con punto y coma y coma
  decimal. Si tu programa importa otra cosa, lo cambiamos.
- ¿Qué **columnas** necesitas que hoy no van? Tenemos número, fecha, sentido,
  contraparte, NIF, concepto, coche, base, tipo, cuota, total, régimen y si es
  suplido.
- ¿Lo quieres **por trimestre** o mensual?
- ¿Quieres también los **PDF** enlazados, o solo los datos?
- ¿Y prefieres que te llegue solo por correo cada periodo, o entras tú a
  descargarlo?

---

## Lo que necesitamos de vuelta, en orden

Si hay que priorizar, este es el orden por el que a nosotros nos duele:

1. **El escrow** (5). Si eso necesita licencia, lo demás da igual.
2. **Nombre propio o ajeno** (1). De ahí cuelga todo el modelo de facturación.
3. **El fee con IVA o sin IVA** (2). Es el precio de la web y cambia el signo
   del margen.
4. **La garantía** (3.3). Sabemos que está mal hoy y queremos arreglarlo antes
   de que haya un cliente de verdad.
5. **El impuesto: sobrante y faltante** (4). Es la decisión que más se va a
   repetir.
6. Lo demás.

Y una cosa que agradeceríamos aunque no la preguntemos: si al leer esto ves algo
que no hemos preguntado porque ni se nos ha ocurrido, dínoslo. Estamos a tiempo
de todo.
