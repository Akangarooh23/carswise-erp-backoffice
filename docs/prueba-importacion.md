# Prueba integral de una importación

Guion para recorrer una importación entera con el navegador delante, de la
solicitud a la entrega. **Ninguna prueba automática puede hacer esto**: las de
código comprueban que las piezas encajan, no que la pantalla se entienda.

Tarda unos veinte minutos. Hazla del tirón, con este documento al lado, y anota
lo que chirríe aunque parezca una tontería — un botón que no se entiende, un
orden raro, algo que no cabe.

**No hay dinero real en juego**: producción está en modo de prueba de Stripe.
Comprobado el 30 de agosto. Usa la tarjeta `4242 4242 4242 4242`, cualquier
fecha futura y cualquier CVC.

---

## Antes de empezar

- [ ] Está desplegado lo último en los dos proyectos.
- [ ] Tienes NIF y dirección en tu perfil de PopCar. Sin eso el pago no arranca.
- [ ] **Sabes a qué transportista y a qué gestoría vas a apuntar.** Se eligen
      de una lista en **Proveedores**; si no está, se añade en el momento sin
      salir de la pantalla.

---

## 1 · Pedir el coche · **en PopCar**

1. Entra en **Marketplace VO → Importación** y abre cualquier coche.
2. Pulsa **Solicitar importación** y rellena.

**Qué tiene que pasar**

- [ ] Sale «Solicitud recibida» con **los cinco pasos** explicados antes del botón.
- [ ] El botón de pagar la fianza **se lee** (texto blanco sobre negro).
- [ ] Debajo, **«Prefiero que me llaméis antes»**.
- [ ] Te llega un correo con la cifra de la fianza.
- [ ] En **Solicitudes** aparece una tarjeta, en la pestaña *Pendiente*.
- [ ] En el **Resumen** sale «Importación pendiente de fianza».

**Prueba también esto**: cierra el modal y vuelve a pedir el mismo coche. **No
debe crearse una segunda solicitud**, ni llegarte otro correo.

---

## 2 · Pagar la fianza · **en PopCar**

Pulsa **Pagar la fianza ahora** y paga con la tarjeta de prueba.

**Qué tiene que pasar, al volver**

- [ ] La tarjeta del panel pasa a **«Fianza pagada el …»**, sin recargar.
- [ ] La solicitud **sigue estando** en Solicitudes — ahora en *En curso*.
- [ ] El Resumen dice «Importación en curso: Fianza pagada».
- [ ] Te llega **la factura por correo, con su PDF**.
- [ ] La factura está en **Facturación**, con número de la serie FIA.

Si algo de esto falla, abre la consola con F12 y busca `[fianza] no consta pagada`.

---

## 3 · El expediente · **en el ERP**

Ve a **Importaciones**. El coche tiene que estar en la columna **Fianza pagada**,
y su importe contado en «Fianzas cobradas».

Ábrelo y:

- [ ] Pasa a **Pedido a Alemania**. Te pide decir qué ha pasado: escríbelo.
- [ ] Se desbloquea **«Cuándo le hemos dicho que lo tendrá»**. Pon una fecha.
- [ ] Cámbiala. **Al cliente le llega un correo con las dos fechas.**
- [ ] Escribe una nota interna y guárdala. Tiene que decir **«Guardada»**.
- [ ] Abajo, en el **historial**, se lee la nota entera y quién la escribió.

---

## 4 · El pedido · **en el ERP**

Ve a **Pedidos**. Tiene que haber uno **creado solo**, con el proveedor alemán y
su precio — que **no** es la cifra que ve el cliente.

### Qué hace falta en cada fase

Un pedido no pasa de fase si le falta lo que esa fase **significa**. No es
papeleo por papeleo: cada cosa se pide en el momento en que se sabe, y ni antes
ni después. Si falta algo, la pantalla te lo dice **antes** de que lo intentes,
y el botón se queda apagado.

| Para pasar a | Hace falta | Por qué ahí |
|---|---|---|
| **Pedido** | A quién se le encarga. Si es un particular, además las cuatro comprobaciones | Encargarlo es comprometerse: sin proveedor no hay a quién reclamar, y a una persona no se le paga sin mirar cargas y deudas |
| **Confirmado** | Por cuánto se ha cerrado | Confirmado quiere decir que hay precio acordado. Sin importe, el coste y el margen de ese coche salen mal desde el primer día |
| **En camino** | Los papeles imprescindibles de su origen | Es cuando se contrata el transporte y se paga. Sin lo que hace nuestro el coche, lo que se mueve es un coche de otro |
| **Recibido** | Kilómetros y llaves | Los kilómetros se leen antes de moverlo y las llaves se cuentan delante de quien lo trae. Después ya no se puede |

Lo que **no** se pide: papeles para confirmar —llegan en momentos distintos, la
factura con el pedido y la ficha la devuelve la gestoría— ni «Al llegar» antes
de que el coche llegue. Y **cancelar no pide nada**: renunciar a comprar es lo
contrario de avanzar.

Por lo mismo, **el pedido abierto solo enseña lo de su fase**: en *Pedido* no
salen los kilómetros de un coche que sigue en Alemania, ni lo que cuesta
reacondicionar uno que nadie ha visto. No se pierde nada — abajo del todo hay
**«Ver todos los datos del pedido»** para corregir cualquier cosa en cualquier
momento.

Saltarse fases tampoco vale de atajo: ir de *Borrador* a *En camino* de una vez
exige lo mismo que haber ido paso a paso.

### «A nombre de»: *El cliente* o *PopCar*

Son los dos botones de arriba del pedido, y **no** son quién vende. PopCar vende
siempre —su factura y su garantía—; esto es **a nombre de quién se pone el
coche**, y ahí está la diferencia entre pagar un cambio de nombre o dos.

| | *El cliente* | *PopCar* |
|---|---|---|
| Cambios de nombre | **Uno**: del vendedor al cliente | **Dos**: al vendedor→PopCar al comprarlo, y PopCar→cliente al venderlo |
| Cuándo | Al venderlo | Al comprarlo, y otra vez al venderlo |
| Plazo de reventa | No corre | **Sí**: el pedido enseña hasta cuándo, y avisa dos meses antes |
| Cuándo se usa | Hay un cliente esperando ese coche concreto | El coche entra en stock sin comprador |

Lo del plazo es lo que importa: si el coche se pone a nuestro nombre, hay un
límite para revenderlo sin que el impuesto de la compra se quede. Pasado, la
factura aparece meses después sobre un coche que ya no interesa a nadie.

### Recórrelo

Va por fases, y **el orden importa**: cada bloque comprueba lo que pide *esa*
fase. Hazlos seguidos y sin adelantarte, o las puertas no dan lo que dicen aquí.

- [ ] Fíjate primero en **lo que sale y lo que no**: en fase *Pedido* solo hay
      «A nombre de», los datos y el estado. Ni «Al llegar» ni el
      reacondicionado, que son de cuando el coche esté aquí. Pulsa abajo **«Ver
      todos los datos del pedido»** y comprueba que aparece todo; vuelve a
      dejarlo como estaba.

**Antes de nada, a nombre de quién va**

- [ ] Mira **«A nombre de»**: debería estar en *El cliente*, porque hay cliente.
      Púlsalo en *PopCar* y mira que aparece el **plazo de reventa**; déjalo
      luego como estaba. Esto no es de ninguna fase: se puede cambiar cuando sea.

**Para confirmarlo: solo el precio**

- [ ] Borra el importe y pulsa **Guardar los datos**. El botón de **«Pasar a
      Confirmado»** se apaga, y encima sale en ámbar **«Por cuánto se ha
      cerrado»** con el motivo.
- [ ] Vuelve a poner el importe y guarda. El botón se enciende: pásalo a
      **Confirmado**.
- [ ] Fíjate en lo que **no** ha hecho falta: no has subido ni un papel. Es a
      propósito — la factura llega con el pedido y la ficha la devuelve la
      gestoría, así que pedirlos aquí sería pedir algo que todavía no existe.

**Para moverlo: los papeles**

- [ ] Sin subir nada aún, mira el botón de **«Pasar a En camino»**: está apagado,
      y el aviso de arriba **nombra los cuatro** que faltan — la ficha del
      vehículo partes I y II, el COC y la factura del vendedor.
- [ ] Baja a **Documentos** —que aparece justo al confirmarlo, no antes—: arriba
      está la lista de lo que se espera de un coche alemán, con esos cuatro
      marcados como imprescindibles.
- [ ] Sube un PDF cualquiera diciendo que es la **ficha del vehículo (parte II)**.
      Ese hueco se cierra, y **sin recargar** el aviso de arriba pasa a nombrar
      solo tres.
- [ ] Sube otro **sin decir qué papel es**. **No debe cerrar ningún hueco**: si
      cerrara, bastaría con subir cualquier cosa para ponerlo todo en verde.
- [ ] Sube los tres que faltan: el aviso desaparece y el botón se enciende.
      Pásalo a **En camino**.

---

## 5 · El transporte · **en el ERP**

Ve a **Transportes**. Tiene que haber un tramo **creado solo**, en *Por
organizar*.

- [ ] Intenta pasarlo a **Contratado** sin transportista. **Te lo impide.**
- [ ] Elige el transportista de la lista. Si no está, pulsa **+ Añadir uno
      nuevo** y escríbelo: se queda dado de alta.
- [ ] Pon el precio y contrátalo.
- [ ] Pásalo a **Recogido** y luego a **Entregado**.
- [ ] Sube una foto en **Documentos** del transporte.

---

## 6 · Al llegar · **en el ERP**

Vuelve al pedido.

- [ ] Intenta pasarlo a **Recibido** sin más. **Te lo impide**: faltan los
      kilómetros y las llaves.
- [ ] Rellena **Al llegar** —kilómetros, llaves, algún daño— y guarda.
- [ ] Ahora sí pasa a **Recibido**.
- [ ] Marca **«No es lo que se compró»** sin escribir nada y guarda. **Te lo
      impide**: decir que algo está mal sin decir qué se reclama no sirve de
      nada dentro de un mes. Escríbelo o desmárcalo.

---

## 7 · Los papeles · **en el ERP**

Ve a **Gestoría**. Tienen que aparecer **tres trámites creados solos**: impuesto
de matriculación, ITV de homologación y matriculación.

- [ ] **No hay ninguna transferencia.** Un coche que nunca ha estado matriculado
      aquí no se transfiere.
- [ ] Intenta mandar uno a gestoría sin decir cuál. **Te lo impide.**
- [ ] Elígele gestoría de la lista y ponle coste, mándalo, y luego márcalo
      **Resuelto**.
- [ ] Los que estén fuera salen arriba, con los días que llevan.

---

## 8 · Lo que ha costado · **en el ERP**

En el pedido, abajo:

- [ ] Añade un gasto de **Reacondicionado** (unos neumáticos).
- [ ] En **Lo que cuesta** tienen que salir **cuatro líneas**: proveedor,
      transporte, gestoría y reacondicionado.
- [ ] La suma tiene que cuadrar con lo que has ido metiendo.
- [ ] Como no está vendido, dice **«esto es lo que llevamos puesto»**, no una
      pérdida.

---

## 9 · La entrega · **en el ERP**

En el expediente de **Importaciones**, en «La entrega»:

- [ ] Marca lo que le das: permiso, ficha, llaves, factura.
- [ ] Intenta cerrarla sin kilómetros. **Te lo impide.**
- [ ] Pon los kilómetros de salida y pulsa **Firmado y entregado**.
- [ ] Sale la **garantía**, con su fecha de fin.
- [ ] Pasa el expediente a **Entregado**.
- [ ] **Al cliente le llega un correo diciendo que ya es suyo.**

---

## 10 · Y por el lado del cliente

Vuelve a PopCar, a su panel:

- [ ] La solicitud está en **Finalizadas**.
- [ ] Ha ido cambiando de paso a lo largo de toda la prueba.
- [ ] Sus facturas están en Facturación.
- [ ] **No ve nada** del proveedor, ni del coste, ni de las notas internas.

---

## 11 · Con quién has trabajado · **en el ERP**

Ve a **Proveedores**.

- [ ] Están el transportista y la gestoría que has usado.
- [ ] Abre el transportista: en **Lo que llevamos con él** tiene que salir ese
      transporte con su importe.
- [ ] Abre la gestoría: sus trámites y lo que han costado.

Esa es la pregunta que justifica tener la lista: cuánto llevamos con cada uno.

---

## Al terminar

Dime lo que hayas anotado. Y si quieres dejarlo limpio, pídeme que borre lo que
haya creado la prueba: la solicitud, el pedido, sus trámites, su transporte y sus
gastos.
