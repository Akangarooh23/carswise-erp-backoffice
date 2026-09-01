# Pendientes de Ana

Lo que queda por hacer y **no puedo hacer yo**: son datos que no tengo,
credenciales, o decisiones que te tocan. Cubre los dos repositorios —el ERP y
PopCar— y lo que vive fuera de ellos, en Vercel y en Supabase.

Esto no es un manual de trabajo: los manuales están en `docs/` y los ve el
equipo en la pantalla de Manual. Esto es tuyo.

**Nada de esto corre prisa hoy**: todavía no hay clientes de verdad usándolo. Lo
que sí hay es un orden, y son dos grupos distintos.

**Lo que hay que tener antes de que entre alguien de fuera** — porque afecta a lo
que ve o a lo que se le cobra: los datos del emisor en las facturas (4), el
secreto para las devoluciones (5) y las variables de Vercel (6). En Stripe no hay
que crear nada; solo comprobar dos cosas (6b).

**Lo que se puede hacer cuando quieras**: los teléfonos (1), la vuelta de estreno
(2), las contraseñas (3), WhatsApp (7) y las dos decisiones (8). Ninguno impide
que el sistema funcione; el 1 solo hace el trabajo más incómodo.

> Actualizado el 29 de agosto de 2026, al terminar los tres flujos del
> Marketplace VO: Concesionarios, Ex-Renting e Importación.

---

## 1 · El teléfono de quien vende — **lo primero**

**Hoy no lo tiene ninguna oferta: 0 de 4.383.**

La regla del flujo de visitas es que a quien tiene el coche hay que llamarle a
mano, siempre, y hasta hoy su teléfono no se guardaba en ningún sitio. Ya hay
dónde ponerlo, pero está vacío: la Agenda dirá **«sin teléfono»** en todas las
visitas hasta que lo rellenes.

Con **tres números** queda cubierto casi todo el catálogo:

| Vendedor | Coches | Sección |
|---|---|---|
| Modrive | 2.626 | Concesionarios |
| Gamboa Ocasión | 880 | Concesionarios |
| VIAN | 695 | Concesionarios |
| Astara | 95 | Ex-Renting |
| Leasys | 87 | Ex-Renting |

Se pone en **Marketplace → la oferta → Teléfono de quien vende** y **Persona por
la que preguntar**. Va por oferta, así que basta con rellenarlo en la ficha de
cualquier coche de ese vendedor cuando se lleve una visita suya.

No sale nunca en PopCar: es un dato de trabajo interno, y hay una prueba que
falla si algún día se cuela en el marketplace.

## 2 · La vuelta de estreno de los dos flujos

Están revisados y probados, pero **nadie los ha recorrido nunca como cliente**
desde todos los cambios. En concreto, nadie ha recibido el correo de «elige una
hora» ni ha pulsado uno de sus botones: ese camino existe probado, no estrenado.

Con un coche de cada sección, diez minutos:

1. Marketplace VO → **Concesionarios** (y luego **Ex-Renting**) → abre un coche.
2. **Solicitar visita**, coge día y hora.
3. Mira tu panel **sin recargar**: tiene que estar, como pendiente de aprobación.
4. En la Agenda: arriba del todo, con quién vende y de qué sección es el coche.
5. **Propone otras horas** con dos: lee lo que va a leer el cliente y envía.
6. Abre el correo **en el móvil**, pincha una hora y confirma en la página.
7. Comprueba que llega la confirmación con el calendario y que en la Agenda
   quedó confirmada, con su rastro completo.
8. **Confirmar** poniendo dónde es y por quién preguntar.

Si eso sale, los dos flujos quedan cerrados también de estreno.

## 3 · Las contraseñas de las dos cuentas

`apicazo@popcar.tech` y `jhernandez@popcar.tech` son las únicas cuentas del ERP,
las dos de administrador. **Sus contraseñas pasaron por el chat cuando las
generé**, así que conviene cambiarlas.

Y hay algo peor que las contraseñas: **`@popcar.tech` no tiene buzón**. Si
alguna vez no podéis entrar, «recuperar contraseña» manda un correo a una
dirección que no recibe nada. No hay puerta de atrás. Decide si montar reenvío
para esas dos direcciones o dejarlo así sabiéndolo.

## 4 · Los datos del emisor en las facturas

El PDF de una factura sigue diciendo:

```
NIF: Pendiente de asignación
Dirección: Pendiente de asignación
```

El pie del mismo documento cita la Ley 37/1992, así que se presenta como factura
formal con dos campos obligatorios sin rellenar. Se cambia en el código —dime los
datos y lo hago en cinco minutos—, pero los datos son tuyos.

**Esto ya no es hipotético.** El 30 de agosto salió la primera factura de fianza
de verdad, la **FIA-2026-0001**, de 4.887 € por un SEAT Ateca. En la cabecera solo
pone «PopCar · www.popcar.tech · popcarmobility@gmail.com»: ni NIF ni dirección
del emisor. Fue una prueba en modo de prueba, pero la siguiente puede no serlo.

## 5 · Para que funcione el cobro de la fianza

El flujo de importación ya cobra la fianza por Stripe y emite factura. Para que
funcione en producción hacen falta dos cosas tuyas:

**El NIF y la dirección del emisor** (el punto 4). Mientras no haya clientes
reales no pasa nada, pero la primera fianza que se cobre de verdad emite una
factura de unos 2.200 € con esos campos sin rellenar. Que esté antes de esa
primera.

**Un secreto compartido entre los dos proyectos**, para poder devolver una
fianza desde el ERP: la clave de Stripe vive en PopCar y no debe salir de ahí,
así que el ERP se lo pide. En Vercel, la misma cadena en los dos:

```
INTERNAL_API_SECRET=<una cadena larga al azar, la misma en ERP y en PopCar>
```

Sin ella el botón de devolver dice que no está configurado, y todo lo demás
—cobrar, facturar— sigue funcionando igual.

## 5b · Importar el flujo de precios en n8n — **el catálogo no cambia sin esto**

El precio de un coche de importación se rehízo entero: el transporte pasó de 700
a 1.500 € —un coche por pedido—, el impuesto de matriculación dejó de calcularse
sobre el precio alemán, y por primera vez el precio lleva **margen de PopCar**.
Hasta ahora se vendía al coste sin que nadie lo hubiera decidido.

El código ya está desplegado, pero **el flujo de n8n no se actualiza solo**: la
copia del repositorio (`n8n-workflows/importacion-scoring.json`) es solo un
fichero. El que corre vive dentro de n8n.

Mientras no lo importes:

- Los **precios ya salen bien** —los calcula la web, no el flujo—.
- Pero **el catálogo sigue teniendo 1.568 coches**, elegidos con los números
  viejos. Hay coches publicados que ya no le ahorran nada al cliente.

Qué hacer, cuando puedas mirar el resultado y no de madrugada:

1. n8n → flujo **«Importación – Scoring (selección inteligente DE)»**
2. Importar `n8n-workflows/importacion-scoring.json`
3. Ejecutarlo a mano, o esperar a la pasada de las 05:00

**El catálogo pasará de 1.568 coches a unos 295.** Está medido ejecutando la
consulta nueva contra la base, y es lo que se busca: los 1.273 que se caen se
estaban enseñando a un precio que no cubría traerlos. Que se reduzca es la señal
de que ahora cubren.

## 5c · Los productos de garantía — **la estructura ya está esperando**

La oferta ya sabe enseñar la garantía: la base va dentro del precio y las demás
salen debajo como diferencia, con lo que cubre cada una. Las tablas están
creadas y vacías, así que **hoy no se ve nada** — la ficha se ve como siempre
hasta que haya productos cargados. Es a propósito: mientras no los haya, no hay
nada que prometer.

Por cada garantía que ofrezcáis necesito:

| Dato | Para qué |
|---|---|
| Nombre | Es lo que ve el cliente |
| Meses y km cubiertos | Sale al lado del nombre |
| **Precio al cliente** | Sin esto no se puede sumar ni restar de un total |
| **Lo que nos cuesta** | Para saber si deja margen. No se enseña nunca |
| Quién la da | Vosotros o una aseguradora. Si es una aseguradora, **hay que darla de alta en Proveedores** con el tipo *Garantías*: el ERP no deja colgar un producto de alguien que no existe |
| Antigüedad y km máximos del coche | Con 12,8 años de media en el catálogo, muchas no se van a poder ofrecer. Enseñar una que luego se cae es peor que no enseñarla |
| Qué cubre **y qué no** | Poder decir lo que no cubre evita la discusión del día que algo se rompe |
| Cuál es la base | La que va incluida en el precio |

### Y una pregunta que hay que contestar antes

**¿Tu producto base está por encima del mínimo legal, o es el mínimo?**

Vendiendo como empresa a un particular, la garantía legal de conformidad no se
puede quitar: el cliente no puede renunciar a ella ni queriendo. Lo que sí se
puede mejorar o rechazar es una garantía comercial por encima de ese mínimo.

Cada producto lleva una marca de **renunciable**, y la opción de «sin garantía»
solo aparece si la base lo es. Si la base es el mínimo legal, esa opción no se
enseña — ofrecer renunciar a algo irrenunciable es ofrecer lo que no se puede
cumplir, y esto lo mira una inspección de consumo.

### Lo que arrastra

La fianza es el 30 % del total. Si el cliente cambia de garantía, cambia el
total y cambia la fianza — se calcula sobre lo que él acepta y se congela en su
solicitud, igual que ya se congela el precio. Eso ya está montado.

Lo que **no** está: una pantalla en el ERP para gestionarlos. Cuando me pases
los productos los cargo yo, como hice con los transportistas y con Bernal; la
pantalla la monto cuando haya suficientes como para que compense.

## 6 · En Vercel

Todo lo que hay que tocar fuera del código está aquí. Nada de esto se despliega
solo: las variables se ponen a mano en cada proyecto.

### Proyecto del ERP

| Variable | Para qué | Si falta |
|---|---|---|
| `INTERNAL_API_SECRET` | Pedirle a PopCar que devuelva una fianza | El botón «Devolver la fianza» dice que no está configurado |
| `PUBLIC_SITE_URL` | Los enlaces de los correos al cliente | Vacía vale: por defecto es `https://www.popcar.tech`. Lo que no puede es apuntar a otro sitio |
| `WHATSAPP_TOKEN` · `WHATSAPP_PHONE_ID` · `WHATSAPP_VERIFY_TOKEN` · `WHATSAPP_APP_SECRET` | Mandar las horas por WhatsApp | El mensaje sale en pantalla para copiarlo. Es lo que pasa hoy |

### Proyecto de PopCar

| Variable | Para qué | Si falta |
|---|---|---|
| `INTERNAL_API_SECRET` | **La misma cadena que en el ERP.** Es lo que los une | No se puede devolver una fianza desde el ERP |
| `SUPABASE_INVOICE_BUCKET` | Mudar las facturas a un cubo privado | Se quedan donde están hoy. Es una decisión, no una avería |

Estas ya tienen que estar, porque el cobro de suscripciones funciona: comprueba
que siguen y no las toques — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`.

La ruta nueva `/api/fianza-devolucion` **no hay que darla de alta**: va en el
`vercel.json` del repositorio y se despliega con el código.

## 6b · En Stripe

**No hay que crear ningún producto ni ningún precio.** La fianza se cobra con un
importe libre, como el informe de tasación: el cargo lleva el nombre del coche y
la cifra que se le dijo a ese cliente. Un producto fijo no valdría, porque cada
fianza es distinta.

Tres cosas que sí conviene mirar en su panel:

**En qué modo estás mirando.** Arriba a la derecha hay un interruptor de **modo
de prueba**. Un pago hecho con tarjeta falsa solo aparece con ese modo
encendido: en la vista normal no sale, y parece que el cobro no existe. El 29
de agosto pasó exactamente eso — se pagó una fianza de 1.019 € y no la
encontrábamos. Antes de dar por perdido un cobro, mira con el interruptor
puesto.

**Que el webhook manda `checkout.session.completed`.** Es el aviso con el que se
da la fianza por cobrada, se avanza el expediente y se emite la factura. Ya hace
falta para las suscripciones y para la tasación, así que casi seguro está; con
ver que el evento está marcado en el endpoint basta.

**Que la clave puede hacer devoluciones.** Una clave secreta normal puede. Si
algún día se cambia por una restringida, necesita permiso de escritura sobre
*refunds*, o el botón de devolver fallará con un error de Stripe.

Las devoluciones salen en Stripe como tales, sobre el cargo original. No hay que
configurar nada para eso.

Y una tranquilidad: aunque ese aviso fallara, **la fianza ya no se pierde**. Al
volver del pago, la pantalla le pregunta directamente a Stripe si esa sesión
está pagada y la anota igual. Lo que llegue primero gana, y nunca se emiten dos
facturas por el mismo cobro.

## 7 · WhatsApp, cuando lo quieras

Hoy el mensaje sale en pantalla y se manda a mano. Para que salga solo, con las
horas como botones que el cliente pulsa, hacen falta cuatro variables en el ERP
y apuntar el webhook en la app de Meta. Está todo escrito en el `README`, en
**Conectar WhatsApp**.

Sin `WHATSAPP_APP_SECRET` el webhook acepta lo que le llegue sin comprobar la
firma: con el número conectado, esa variable no es opcional.

## 7b · El IVA de la fianza

La factura de la fianza sale con **21 % de IVA desglosado**. La primera, la
FIA-2026-0001, quedó así:

```
Base imponible:  4.038,84 EUR
IVA (21 %):        848,16 EUR
TOTAL:           4.887,00 EUR
```

El PDF lo aplica siempre, porque es el mismo que emite las facturas de los
informes de tasación, donde el 21 % sí corresponde.

Una fianza no es lo mismo. Si es una **garantía que se devuelve**, no hay entrega
de nada y normalmente no lleva IVA. Si es un **pago a cuenta** del coche, sí lo
lleva — pero entonces hay que mirar si esa venta va por el régimen especial de
bienes usados, donde el IVA ni siquiera se desglosa.

Es una pregunta para tu gestoría, no para mí: yo puedo cambiar el PDF en un rato,
pero quien decide qué IVA lleva esa factura no soy yo. Lo que no puede pasar es
que la primera fianza de un cliente real salga con un 21 % puesto por inercia.

## 8 · Dos decisiones

**Las facturas, ¿a un cubo privado?** Sus PDF están en un almacén público. Ya no
se puede llegar a ellos adivinando la ruta, y ni PopCar ni el ERP enseñan su
dirección: se sirven por una ruta que pide sesión. Pero el fichero, con su
enlace, sigue siendo abierto. El código ya no depende de que lo sea, así que
mudarlos es crear el cubo y cambiar `SUPABASE_INVOICE_BUCKET`.

Con la fianza esto pesa más que antes: la FIA-2026-0001 lleva tu nombre, tu NIF y
tu dirección de casa, y está en una dirección pública. Basta con que alguien
tenga el enlace. Antes eran facturas de 10 €; ahora son documentos con los datos
fiscales completos de quien compra un coche.

**El informe de inspección de los ex-renting.** Los 159 coches en venta de Astara
y Leasys llevan informe de DEKRA, y hoy **no se le enseña al cliente**. Es un
argumento de venta que estamos guardando en un cajón. Antes de enseñarlo hay que
mirar cuáles se abren sin usuario: varios piden credenciales.

---

## 9 · El modelo de coste — **tres decisiones, y la primera es dinero puesto**

El Excel de costes de importación trae dos números reales que corrigen lo que
hay hoy en el código, y están medidos sobre las 1.568 ofertas publicadas:

| Partida | En el código | Real | Dif. |
|---|---|---|---|
| Transporte | 1.500 € | **1.113 €** (750 Alemania→Zaragoza + 363 Zaragoza→destino) | −387 |
| Papeleo | 600 € | **230 €** (ITV 122,20 + gestoría 83,60 + placas 24) | −370 |

**Le estamos cargando 772 € de más a cada coche**, y no son beneficio: son
colchón dentro del coste, cobrado al cliente y no ganado por nadie. Con los
números reales, el catálogo pasa de que **1.035 de 1.568** salgan a cuenta a que
salgan **los 1.568**, con un ahorro medio de 1.261 € en vez de 885 €.

**Decisión 1 — bajar las dos constantes.** Es coste puro y no admite discusión.
Está sin hacer, esperando tu visto bueno.

**Decisión 2 — cómo se forma el precio.** Hoy es *coste + margen*, y en un
negocio de arbitraje eso regala el arbitraje: el ahorro que damos oscila entre el
4 % y el 33 % según el coche. Hay **371 coches donde regalamos más del 20 %**; con
la regla del mayor de dos —`max(coste + margen, comparable × 0,85)`— serían
**975 € más por coche**. La tabla de márgenes pasa a ser el suelo, no la
respuesta.

**Decisión 3 — la base del impuesto, para tu gestoría.** Usamos el comparable
español, que es la opción más alta: 480 € de media. Con la flota a 12,8 años de
media, el coeficiente de antigüedad de Hacienda es 0,10–0,13, y por ese camino
saldría bastante menos. Vamos por lo seguro a propósito, pero eso lo firma quien
responde.

---

## 10 · Eurotax — **tres cosas que pedir en el contrato**

El cruce ya está montado: cada oferta sale con clave `marca|modelo|año|
combustible|kW` —585 claves distintas para 1.568 coches— y con un nivel de
confianza, alta en 930 y media en 637. La cilindrada está sacada del titular
alemán y escrita en 18.375 ofertas.

Lo que hay que atar antes de depender de ellos:

- **Qué ciclo devuelve el CO₂, NEDC o WLTP, y para qué años.** El impuesto se
  calcula sobre WLTP, y WLTP suele salir un 20–25 % por encima: eso es una banda
  entera del impuesto. Que lo pongan por escrito.
- **Si la licencia permite enseñar el valor al cliente.** Estos contratos suelen
  separar uso interno de publicación. El valor de mercado es lo que sostiene el
  ahorro que anunciamos: si no se puede publicar, cambia la ficha.
- **Qué pasa cuando no cruza.** Versiones del mercado alemán que nunca se
  vendieron aquí va a haber. Hay que decidirlo antes: no publicar, o publicar
  marcado como estimado.

Y una red que ya tenemos: **el COC lleva el CO₂ exacto** y se compra siempre con
él. Eurotax sirve para publicar; el COC, para cobrar.

---

## Lo que ya se decidió y no hay que volver a mirar

**Avisar al vendedor automáticamente: no.** No tenemos su correo, y el
marketplace tiene y va a tener secciones donde el vendedor es cosa distinta
—particular, importación, renting, portales—. A quien tiene el coche se le llama
a mano, y el sistema no le escribe nunca. La única excepción es el **particular**,
del que sí tenemos dirección y al que se avisa solo al reservar.
