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

## Pendiente

- Llevar las reservas del marketplace a Solicitudes y a Inicio, como está
  descrito arriba.
- `UserDashboardAppointments.js` no lo importa nadie: es código muerto. O se usa
  para esto, o se borra. Un fichero que parece que hace algo y no se ejecuta es
  una trampa para quien lo lea después.
