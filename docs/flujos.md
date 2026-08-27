# Flujos entre PopCar y el ERP

Qué pasa cuando un cliente hace algo en PopCar, dónde se ve en el ERP, qué tiene
que ejecutar un trabajador y qué ocurre cuando lo ejecuta.

Cada flujo se documenta leyendo el código, con la referencia al fichero y la
línea. Si algo aquí no coincide con lo que hace el sistema, manda el código: lo
que hay que corregir es este documento.

---

## 1. Visita a una oferta de concesionario desde el marketplace VO

### Lo que hace el cliente

Entra en el marketplace VO, abre una oferta de concesionario y pulsa **Solicitar
visita**. Se le abre un calendario, elige día y hora, rellena nombre, teléfono y
notas, y confirma.

### Por dónde pasa

| Paso | Dónde |
|---|---|
| Botón y calendario | `src/pages/PortalVoDetailPage.js:821` → `src/components/SlotPicker.js` |
| Pedir horarios libres | `GET /api/visit-availability?offerId=…` |
| Confirmar la reserva | `POST /api/visit-availability` con `route: "book"` |
| Lo que la ejecuta | `lib/api/visit-availability-handler.js:321` (`bookSlot`) |

La reserva se hace **dentro de una transacción**, con `SELECT … FOR UPDATE` sobre
el hueco. Dos personas que pulsen a la vez no pueden reservar la misma hora: la
segunda recibe `slot_unavailable` y el calendario le quita ese hueco de la
pantalla.

El **correo del vendedor lo resuelve el servidor** leyéndolo de la oferta, no
llega del navegador. Antes venía de fuera, y eso permitía que cualquiera se
hiciera mandar la visita de otro.

### Qué queda escrito

Dos tablas, ninguna de ellas la de leads:

- `vehicle_visit_availability` — el hueco pasa de `available` a `booked`.
- `vehicle_visit_bookings` — fila nueva con estado `confirmed`, y dos testigos
  (`token_buyer`, `token_seller`) que son los que permiten cancelar o cambiar la
  cita desde el enlace del correo, sin contraseña.

### Quién recibe correo

| Quién | Qué recibe |
|---|---|
| El cliente | Confirmación con el `.ics` para meterla en su calendario |
| Operaciones | Aviso de cita nueva, a `OPS_EMAIL` o, si no está, a `INTERNAL_EMAIL` |
| El concesionario | **Nada** |

El vendedor solo recibe correo cuando la oferta es de un particular
(`visit-availability-handler.js:163`). En una oferta de concesionario el aviso va
a operaciones, y es operaciones quien tiene que avisar al concesionario.

### Dónde se ve en el ERP

**Agenda** (menú lateral, `/bookings`). Sale toda la lista de citas confirmadas
ordenada por fecha, con buscador y filtro de rango. Al desplegar una fila se ven
el correo, el teléfono y las notas del cliente.

También se ve **por vehículo**, dentro de Marketplace → la oferta → panel de
visitas, que muestra los huecos y las reservas de ese coche en concreto.

### Qué puede ejecutar un trabajador, y qué pasa

| Acción | Qué hace | Qué **no** hace |
|---|---|---|
| **Confirmar** (solo pendientes) | Pasa la reserva a `confirmed` y **escribe al cliente** con el `.ics` | Avisar al concesionario |
| **Cancelar cita** | Marca la reserva como `cancelled`, devuelve el hueco a `available` y **escribe al cliente** con el motivo y un enlace para pedir otra hora | Avisar al concesionario |
| **Contactar** | Abre el correo con el asunto puesto | Nada automático |
| **Llamar** | Abre el teléfono | Nada automático |
| **Añadir o quitar huecos** | Publica disponibilidad para esa oferta, con `source: 'erp'` | — |

Todo queda en el registro de actividad: el middleware de auditoría anota
cualquier escritura que salga bien (`apps/api/src/app.ts:38`).

---

## Lo que este flujo no hace, y conviene saber

Tres cosas que no son fallos de código —funciona como está escrito— pero que
cambian cómo hay que trabajarlo.

### Los horarios inventados — resuelto

Si una oferta de concesionario no tiene disponibilidad publicada, al primer
cliente que abre el calendario **se le generan huecos automáticamente**: lunes a
viernes, de 9 a 18, durante doce semanas, con `source: 'auto'`
(`visit-availability-handler.js:230`). Eso se queda: sin ellos, una oferta sin
horarios publicados no recibiría ni una visita.

Lo que cambia es lo que se promete encima de ellos. Antes la reserva nacía
`confirmed` y al cliente le llegaba el archivo de calendario, aunque nadie
hubiera dicho que el concesionario abre ese día.

| Hueco | Estado al reservar | Qué recibe el cliente |
|---|---|---|
| Publicado desde el ERP | `confirmed` | Confirmación y `.ics`, como siempre |
| Generado solo | `pending` | «Hemos recibido tu solicitud» — **sin `.ics`** |

En la Agenda, las pendientes salen **arriba, en su propio bloque**, con
**Confirmar** y **No puede ser**. Confirmar es lo que le promete algo al cliente,
y por eso es ahí donde sale el correo con el calendario.

Un `.ics` en el móvil de alguien es una cita cerrada. Por eso solo sale cuando
lo es.

**Sigue mereciendo la pena** publicar los huecos reales desde el ERP: en cuanto
hay uno creado a mano, el sistema deja de inventarse ninguno y las reservas
vuelven a nacer confirmadas, sin pasar por nadie.

### Cancelar desde el ERP — resuelto

Antes la ruta solo tocaba la base: el cliente no se enteraba y se presentaba
igual. La única defensa era acordarse de escribirle, y esa es una instrucción
que se incumple sola.

Ahora, al cancelar, el ERP pide un motivo —opcional— y **le manda un correo al
cliente** contándole qué visita se ha caído, por qué, y con un enlace para pedir
otra hora en ese mismo anuncio.

Dos detalles que importan:

- El correo sale **aunque haya un desvío de pruebas configurado**. Enterarse de
  que tu cita se ha caído no puede depender de una variable de entorno.
- Si el envío falla, **la cancelación se hace igual** —ya está hecha— pero la
  pantalla lo dice: «cancelada, pero no hemos podido avisar, llámale». Una cita
  cancelada de la que el cliente no se ha enterado no es lo mismo que una cita
  cancelada, y quien la cancela tiene que poder distinguirlo sin ir a mirar
  ningún registro.

Sigue sin haber **reprogramar** en el ERP. Existe en PopCar para el cliente
(`rescheduleBooking`), pero desde el ERP solo se puede cancelar; el enlace del
correo es lo que le permite elegir otra hora.

Y sigue sin avisarse al **concesionario**, ni al reservar ni al cancelar.

### Estas citas no generan recordatorio

El recordatorio de cita —el que sale a las 08:00— lee `moveadvisor_market_leads`,
y estas reservas viven en `vehicle_visit_bookings`. **Nada las copia de una tabla
a la otra.** Así que una visita reservada desde el marketplace no recibe ni el
aviso de la víspera, ni el del día, ni el de después.

Esto es porque hay **dos sistemas de visitas en paralelo**:

| | Reserva del marketplace | Cita puesta desde el ERP |
|---|---|---|
| Quién la crea | El cliente, con el calendario | Un trabajador, en Leads |
| Dónde vive | `vehicle_visit_bookings` | `moveadvisor_market_leads` |
| Dónde se ve | Agenda | Leads |
| Recordatorios | **No** | Sí, a las 08:00 |
| Cancelar avisa al cliente | No | — |

**Mientras siga así:** las citas de la Agenda hay que recordarlas a mano.

---

## Pendiente de documentar

- Oferta de particular: solicitar visita
- Oferta de importación: solicitar importación
- Oferta de renting: solicitar oferta
- Solicitud de servicio y taller
- Alertas de mercado
- Publicar un coche propio y su informe de estado
