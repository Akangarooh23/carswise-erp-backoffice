# El panel del cliente: qué ve y dónde

Cuando un cliente llama preguntando «¿dónde veo esto?», aquí está la respuesta.
Y para quien vaya a tocar el panel, por qué está organizado así.

---

## Las diez secciones

| Sección | Qué hay dentro |
|---|---|
| **Inicio** | Resumen y últimos movimientos |
| **Oportunidades** | Coches que ha guardado |
| **Alertas** | Avisos de mercado que tiene puestos |
| **Citas Mantenimiento** | Citas de taller para su coche |
| **Servicios** | Servicios que ha pedido para su coche |
| **Tasaciones** | Operaciones · tasaciones |
| **Cuenta** | Cuenta y facturación |
| **Preferencias** | Ajustes |
| **Vehículos** | Sus coches publicados, y las visitas que otros reservan sobre ellos |
| **Solicitudes** | Información, visitas y consultas sobre coches que le interesan |

## El eje por el que están separadas

No es compra contra venta. Es más útil que eso, y ya funciona:

- **Lo que pide** → Solicitudes
- **Lo que tiene** → Vehículos
- **Su coche en el taller** → Citas Mantenimiento y Servicios

Un mismo cliente puede estar en los tres papeles a la vez, y por eso el panel no
le obliga a elegir uno.

---

## El hueco: las visitas del marketplace

Una visita reservada con el calendario **no aparece en Solicitudes**. Esa pantalla
lee `/api/leads`, y la reserva no es un lead: vive en `vehicle_visit_bookings`.

El cliente la sigue desde **el enlace de su correo**, `/mi-cita?id=…&token=…`. Esa
página no pide contraseña —el testigo hace de llave— y desde ahí ve el estado,
cambia la hora o anula.

**Si alguien pregunta «no veo mi cita en mi cuenta», la respuesta es esa.**

---

## Cómo se va a resolver, y por qué así

La pregunta era si convenía una sección aparte para las citas de compra,
separada de las solicitudes de venta.

### Por qué no una pestaña nueva

**Ya hay diez.** Una más no hace el panel más claro; hace más largo el recorrido
hasta encontrar algo.

**El nombre está cogido.** «Citas Mantenimiento» son las de taller. Una pestaña
«Citas» al lado es exactamente el menú donde la gente entra en la equivocada, y
luego llama preguntando.

**Solicitudes ya sabe pintar visitas.** Maneja estados como «Cita anulada» y
«Visita realizada», y el flujo de qué pasó después. Le faltan las del
marketplace, no la capacidad de enseñarlas.

**Para el cliente son lo mismo.** Pedir visita, pedir información y pedir renting
son «cosas que he pedido sobre coches que quiero». Que por dentro unas sean leads
y otra una reserva es un detalle de implementación, y un detalle de
implementación no debería asomar en su pantalla.

### Pero el problema que había detrás es real

Separarlo nace de algo cierto: **una cita no es una solicitud cualquiera**. Una
petición de información puede esperar; una cita el martes a las diez hay que
verla. Enterrada en una lista de solicitudes, se pierde.

Eso no se arregla con una pestaña —donde también habría que entrar—, sino
**sacándola a donde ya se mira**:

- Arriba del todo en **Inicio**, si tiene una visita próxima: día, hora, coche y
  el enlace para moverla.
- Arriba en **Solicitudes**, separada del resto, no mezclada en la lista.
- Con su estado a la vista: **Pendiente de confirmar**, **Confirmada** o
  **Cancelada**.

Es el mismo criterio que se usó en la Agenda del ERP con las visitas por
confirmar: lo que hay que atender va arriba y aparte, no dentro de una lista
donde se despacha lo demás.

### Cuándo sí habría que separar

Si algún día la venta tiene flujo propio —ofertas recibidas, negociación,
contrato—, entonces sí merece una sección **Vender** con todo eso junto. Hoy no
existe ese flujo, y crear la estructura antes que el contenido deja pestañas
vacías, que es peor que no tenerlas.

---

## Cómo quedó

Las reservas del marketplace **ya llegan al panel**, en tres sitios y con un
criterio: cada uno hace algo que los otros no.

| Dónde | Qué enseña |
|---|---|
| **La campana**, en la cabecera del sitio | Cuántas citas tienes por delante. Se ve mientras miras coches, sin entrar a la cuenta |
| **Inicio** | La cita más próxima, la primera de la lista de movimientos: es lo único ahí que tiene día y hora |
| **Solicitudes** | El bloque de arriba con todas las futuras, su estado y el enlace para moverlas. Y abajo, en la lista, como una solicitud más |

La campana **solo cuenta citas** —visitas del marketplace y citas puestas desde
el ERP—, nunca alertas ni novedades. Si lo llevara todo, siempre tendría un
número, y una campana que siempre tiene un número deja de mirarse en dos
semanas. No se apaga a mano: una cita desaparece cuando pasa.

Y es un enlace, no un desplegable: lleva a Solicitudes, al bloque que ya existe.

`UserDashboardAppointments.js` está borrado. Era código muerto que no importaba
nadie, y además no valía para esto: iba de mantenimiento, seguros y sugerencias,
y esa pestaña ya la dibuja `UserDashboardOperations`. Este documento llegó a
decir «o se usa para esto»; era falso, y por eso se comprobó antes de tocarlo.

---

## Quién puede ver los datos de quién

Este documento llegó a decir que **el panel se identificaba solo con el correo,
sin sesión**. Era falso. Se comprobó pidiéndole los datos de alguien a
producción sin haber entrado, y contesta **401**: el correo que viaja en la URL
llega y se descarta.

La regla vive en `lib/api/identidad.js` y es una sola: **manda la sesión, nunca
la URL**. La cookie es `HttpOnly`, va firmada y se comprueba contra la tabla de
sesiones. Fuera de producción se admite el correo de la petición, para poder
probar un endpoint sin montar antes una sesión; esa puerta se cierra sola en
cuanto hay `NODE_ENV=production` o se está en Vercel.

### Lo que sí estaba abierto

La **factura en PDF**. Se conformaba con el número de factura y el correo, sin
mirar la sesión. Y los números no siempre son impredecibles: junto a
`CW-2026-DEPBCJ` hay `SUBS-2026-0001` y `GZNNTAHZ-0003`. Con el correo de
alguien y un número correlativo se le podía descargar una factura con su nombre,
su teléfono, su NIF y su dirección.

Ya exige sesión. Y la consulta sigue filtrando por correo, que es lo que impide
ver la factura de otro aun teniendo sesión propia.

Estaba abierto porque la regla existía **en un solo sitio**, dentro del manejador
de la cuenta, y quien escribió el de la factura no la tenía a mano. Por eso ahora
está en su propio módulo, con diez pruebas: que el correo de la URL se ignore
aunque haya sesión, que sin sesión no haya correo, y que si leer la sesión
revienta no se dé por buena.

## Pendiente

- **Los PDF de las facturas están en URL públicas.** Comprobado: se descargan sin
  ninguna credencial. Exigir sesión protege la búsqueda, no el fichero — quien
  tenga la dirección, lo abre. Lo correcto es servirlos con una URL firmada que
  caduque, y dejar el almacén cerrado.
