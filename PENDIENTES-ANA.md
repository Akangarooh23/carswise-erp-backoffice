# Pendientes de Ana

Lo que queda por hacer y **no puedo hacer yo**: son datos que no tengo,
credenciales, o decisiones que te tocan. Cubre los dos repositorios —el ERP y
PopCar— y lo que vive fuera de ellos, en Vercel y en Supabase.

Esto no es un manual de trabajo: los manuales están en `docs/` y los ve el
equipo en la pantalla de Manual. Esto es tuyo.

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

**El NIF y la dirección del emisor** (el punto 4). Antes era un defecto en un
PDF; ahora vas a emitir facturas de unos 2.200 € con esos campos sin rellenar.
Esto ya no puede esperar.

**Un secreto compartido entre los dos proyectos**, para poder devolver una
fianza desde el ERP: la clave de Stripe vive en PopCar y no debe salir de ahí,
así que el ERP se lo pide. En Vercel, la misma cadena en los dos:

```
INTERNAL_API_SECRET=<una cadena larga al azar, la misma en ERP y en PopCar>
```

Sin ella el botón de devolver dice que no está configurado, y todo lo demás
—cobrar, facturar— sigue funcionando igual.

## 6 · En Vercel

**Proyecto del ERP:** que `PUBLIC_SITE_URL` esté vacía o valga
`https://www.popcar.tech`. De ahí salen los enlaces de los botones del correo de
horas: si apunta a otro sitio, el cliente pincha y no llega a ninguna parte.

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
