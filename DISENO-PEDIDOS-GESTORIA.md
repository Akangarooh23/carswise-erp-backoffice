# Pedidos y Gestoría — cómo se van a montar

Nota de diseño, no manual. El manual de los trabajadores vive en `docs/`; esto es
para quien escriba el código, y para poder discutir la forma antes de tenerla
hecha.

## De dónde sale

Hoy **Importaciones mezcla dos cosas que no son la misma**:

- **El pedido**: encargar el coche a un proveedor, pagarlo, esperar a que llegue.
  Pasa igual con un coche de Alemania, con uno reservado en un concesionario y
  con uno comprado a una empresa de renting.
- **Los trámites**: matriculación, transferencia, impuestos, ITV. Hacen falta en
  cualquier venta de segunda mano, venga el coche de donde venga.

Mientras solo hubiera importaciones, tenerlo junto salía barato. En cuanto hay
una venta entre particulares que necesita una transferencia, o un coche de
concesionario que hay que reservar, deja de valer: no hay sitio donde ponerlo.

## Las dos piezas

### Pedidos

Un pedido tiene ficha propia. No es una vista de otra cosa, porque hay pedidos
que no salen de una solicitud: comprar una unidad para stock no tiene cliente
detrás todavía.

Lleva: **proveedor**, **vehículo**, **importe**, **estado**, y de forma opcional
el **cliente** y el **expediente** del que salió.

**Estados**, los mismos para todos los orígenes:

| Estado | Qué quiere decir |
|---|---|
| Borrador | Se está preparando; aún no se ha pedido nada |
| Pedido | Se ha encargado al proveedor |
| Confirmado | El proveedor lo acepta y da fecha |
| En camino | Sale del proveedor |
| Recibido | Está en nuestras manos |
| Cancelado | No sigue |

**Origen** (de dónde viene el coche): importación, concesionario, ex-renting,
particular, stock.

### Gestoría

Los trámites son de gestoría **externa**: hay que poder mandarle documentación,
apuntar qué ha devuelto y cuándo, y ver de un vistazo en qué está esperando cada
coche.

Un trámite lleva: **qué trámite es**, **de qué coche**, **quién lo lleva**, su
**estado**, sus fechas y sus documentos.

**El tipo de trámite es un catálogo abierto, no una lista cerrada por producto.**
Lo que hace falta depende del caso —una importación pide matriculación, una venta
entre particulares pide transferencia, y un mismo coche puede necesitar las dos—,
así que el sistema no decide cuáles tocan: se añaden los que hagan falta.

**Estados de un trámite:**

| Estado | Qué quiere decir |
|---|---|
| Pendiente | Hace falta, no se ha empezado |
| Documentación incompleta | Falta algo nuestro o del cliente |
| Enviado a gestoría | Está fuera, esperando |
| En trámite | La gestoría lo está tramitando |
| Resuelto | Devuelto y terminado |
| Rechazado | Vuelve con problemas |

Un trámite se cuelga de un pedido, de una solicitud, o de nada: basta con la
matrícula o el bastidor y el cliente. Una transferencia entre particulares no
tiene pedido detrás y tiene que caber igual.

## Lo que no se toca

**Las etapas de una importación se quedan como están.** Son lo que el cliente ve
en su panel —«Pedido a Alemania», «En transporte», «En trámites»— y cambiarlas
sería cambiarle el relato a mitad de camino a quien ya ha pagado.

El pedido es el registro interno: proveedor, coste, fechas reales. Cuando el
pedido avanza, la etapa del expediente avanza con él; la etapa nunca manda sobre
el pedido. Un solo sentido, para que no haya dos verdades.

## En qué orden se hace

1. ~~**Pedidos**: tabla, API y sección.~~ **Hecho.** Una importación que llega a
   «Pedido a Alemania» crea su pedido.
2. ~~**Gestoría**: tabla, API y sección, con la gestoría externa y sus fechas.~~
   **Hecho.** «En trámites» abre los tres papeleos que necesita un coche de
   fuera: impuesto, ITV de homologación y matrícula.

   **Falta una cosa**: los documentos de un trámite. Hoy los papeles se suben al
   expediente, y un trámite suelto —una transferencia entre particulares, que no
   tiene expediente detrás— no tiene dónde ponerlos. Para arreglarlo bien hay que
   hacer genérico el almacén de documentos, que ahora solo entiende de
   solicitudes.
3. **Los demás orígenes**: concesionario, ex-renting y particulares empiezan a
   crear pedidos y trámites. Aquí se decide qué queda de la sección de
   Importaciones: probablemente una vista sobre lo mismo, filtrada por origen.

Cada paso se termina antes de empezar el siguiente.
