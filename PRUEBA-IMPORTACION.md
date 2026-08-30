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

- [ ] Mira **«A nombre de»**: debería estar en *El cliente*, porque hay cliente.
- [ ] En **Documentos**, arriba, salen los papeles que faltan: la ficha del
      vehículo y el COC en rojo.
- [ ] Sube cualquier PDF diciendo que es la **ficha del vehículo**. Ese hueco se
      cierra.
- [ ] Sube otro **sin decir qué papel es**. **No debe cerrar ningún hueco.**
- [ ] Pasa el pedido a **Confirmado**.

---

## 5 · El transporte · **en el ERP**

Ve a **Transportes**. Tiene que haber un tramo **creado solo**, en *Por
organizar*.

- [ ] Intenta pasarlo a **Contratado** sin transportista. **Te lo impide.**
- [ ] Pon transportista y precio, y contrátalo.
- [ ] Pásalo a **Recogido** y luego a **Entregado**.
- [ ] Sube una foto en **Documentos** del transporte.

---

## 6 · Al llegar · **en el ERP**

Vuelve al pedido.

- [ ] Intenta pasarlo a **Recibido** sin más. **Te lo impide**: faltan los
      kilómetros y las llaves.
- [ ] Rellena **Al llegar** —kilómetros, llaves, algún daño— y guarda.
- [ ] Ahora sí pasa a **Recibido**.

---

## 7 · Los papeles · **en el ERP**

Ve a **Gestoría**. Tienen que aparecer **tres trámites creados solos**: impuesto
de matriculación, ITV de homologación y matriculación.

- [ ] **No hay ninguna transferencia.** Un coche que nunca ha estado matriculado
      aquí no se transfiere.
- [ ] Intenta mandar uno a gestoría sin decir cuál. **Te lo impide.**
- [ ] Ponle gestoría y coste, mándalo, y luego márcalo **Resuelto**.
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

## Al terminar

Dime lo que hayas anotado. Y si quieres dejarlo limpio, pídeme que borre lo que
haya creado la prueba: la solicitud, el pedido, sus trámites, su transporte y sus
gastos.
