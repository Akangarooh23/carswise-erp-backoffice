# Cómo acabó una visita: quién lo escribe

`vehicle_visit_bookings.resultado` es la única columna que escriben **las dos
aplicaciones**: el ERP y PopCar. Todo lo demás de esa tabla lo toca una sola.

Esto está escrito porque dentro de seis meses nadie se va a acordar de por qué
una visita se cerró sola, y porque de ese dato sale una factura de 200 € a un
concesionario.

## Los tres valores, y nada más

`no_fue` · `fue` · `compro`

Los fija un `CHECK` en la base —`chk_resultado_de_la_visita`—, así que ninguna
de las dos aplicaciones puede meter una cuarta cosa aunque se equivoque. Si
algún día hace falta un cuarto final, se añade al `CHECK`, a la lista del ERP
—`lib/resultado-de-la-visita.ts`, en los dos lados— y a la de PopCar
—`COMO_ACABO` en `visit-availability-handler.js`—. Las tres o ninguna.

## Quién puede escribirlo

| Quién | Desde dónde | Cuándo |
|---|---|---|
| Un trabajador | ERP → Agenda | La visita está confirmada y ya ha empezado |
| El cliente | El correo de «¿qué tal fue?» → `/como-fue` | Lo anterior, y **hasta 14 días** después |

Las dos escriben también una línea en `visit_booking_events` con evento
`resultado`. Lo que las distingue es el **actor**: `cliente`, o el correo de
quien lo apuntó. La Agenda lee el último de esos pasos para decir «lo dijo el
cliente» cuando toca.

## Las reglas que no se saltan

**El trabajador gana.** Si la visita ya tiene resultado, el enlace del cliente
no lo pisa: se le dice «ya lo teníamos apuntado». Quien llamó al concesionario
sabe más que el recuerdo del cliente una semana después.

**Un trabajador sí puede corregir**, desde la Agenda, y cada cambio deja en el
rastro lo que decía antes. Es la asimetría a propósito: una persona que se
equivocó de fila tiene que poder arreglarlo; un enlace de correo, no.

**Catorce días.** El seguimiento sale entre el mismo día y tres días después de
la visita, así que dos semanas dan de sobra. Pasado eso, el enlace ya no vale:
uno viejo reabriendo un caso cerrado hace más daño que el dato que trae.

**Nada de esto emite una factura.** El resultado deja la venta *lista* para
facturar, en Comisiones y en Pendientes. Emitirla sigue siendo una persona
pulsando un botón en el ERP, y esa persona ve de dónde viene el dato. Un clic
sin comprobar no puede facturarle a un tercero.

## Si mañana se cambia algo

Lo que hay que tocar a la vez, en los dos repositorios:

- Los valores → el `CHECK`, las dos copias del ERP y la de PopCar.
- El plazo → `DIAS_PARA_CONTESTAR` en PopCar.
- Quién gana → la comprobación de `ya_cerrada` en PopCar. El ERP no la tiene a
  propósito.

Cada una tiene su prueba, y romperla a mano hace fallar algo. Comprobado.
