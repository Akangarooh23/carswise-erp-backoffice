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

Dos cosas que sí conviene mirar en su panel:

**Que el webhook manda `checkout.session.completed`.** Es el aviso con el que se
da la fianza por cobrada, se avanza el expediente y se emite la factura. Ya hace
falta para las suscripciones y para la tasación, así que casi seguro está; con
ver que el evento está marcado en el endpoint basta.

**Que la clave puede hacer devoluciones.** Una clave secreta normal puede. Si
algún día se cambia por una restringida, necesita permiso de escritura sobre
*refunds*, o el botón de devolver fallará con un error de Stripe.

Las devoluciones salen en Stripe como tales, sobre el cargo original. No hay que
configurar nada para eso.

## 7 · WhatsApp, cuando lo quieras

Hoy el mensaje sale en pantalla y se manda a mano. Para que salga solo, con las
horas como botones que el cliente pulsa, hacen falta cuatro variables en el ERP
y apuntar el webhook en la app de Meta. Está todo escrito en el `README`, en
**Conectar WhatsApp**.

Sin `WHATSAPP_APP_SECRET` el webhook acepta lo que le llegue sin comprobar la
firma: con el número conectado, esa variable no es opcional.

## 8 · Dos decisiones

**Las facturas, ¿a un cubo privado?** Sus PDF están en un almacén público. Ya no
se puede llegar a ellos adivinando la ruta, y ni PopCar ni el ERP enseñan su
dirección: se sirven por una ruta que pide sesión. Pero el fichero, con su
enlace, sigue siendo abierto. El código ya no depende de que lo sea, así que
mudarlos es crear el cubo y cambiar `SUPABASE_INVOICE_BUCKET`.

**El informe de inspección de los ex-renting.** Los 159 coches en venta de Astara
y Leasys llevan informe de DEKRA, y hoy **no se le enseña al cliente**. Es un
argumento de venta que estamos guardando en un cajón. Antes de enseñarlo hay que
mirar cuáles se abren sin usuario: varios piden credenciales.

---

## Lo que ya se decidió y no hay que volver a mirar

**Avisar al vendedor automáticamente: no.** No tenemos su correo, y el
marketplace tiene y va a tener secciones donde el vendedor es cosa distinta
—particular, importación, renting, portales—. A quien tiene el coche se le llama
a mano, y el sistema no le escribe nunca. La única excepción es el **particular**,
del que sí tenemos dirección y al que se avisa solo al reservar.
