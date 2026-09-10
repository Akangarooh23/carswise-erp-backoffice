# Flujo marketplace — ex-renting

Una visita a un coche que devuelve una empresa de renting: flota usada que se
vende de segunda mano. Hoy son **Astara** —95 coches— y **Leasys** —87—.

El camino es **el mismo que el de concesionario**. Lo que cambia son dos cosas,
y las dos hacen que la llamada sea más importante: no sabemos a quién llamar y
casi nunca sabemos dónde está el coche.

El color dice quién lo hace: azul el cliente, gris lo que pasa solo, morado un
correo que sale, verde algo que se hace en el ERP y amarillo algo que hace una
persona por su cuenta.

---

## Lo que cambia respecto a un concesionario

| | Concesionario | Ex-renting |
|---|---|---|
| Quién tiene el coche | Un concesionario, con su tienda | Astara o Leasys |
| Su teléfono | En la ficha del proveedor | **Ninguna de las 182 ofertas lo trae** |
| El enlace de **origen** | Su anuncio, con teléfono dentro | Un informe de **DEKRA**. Ni anuncio ni teléfono, y algunos piden usuario |
| Dónde se ve | En su tienda | Donde diga la empresa. **83 de 182 ofertas dicen «Toda España»** |
| Contacto | Uno por concesionario | Uno para toda la flota: los 95 de Astara llevan el mismo |

Lo de la ubicación no es un detalle. «Toda España» no es un sitio al que mandar
a nadie: en más de la mitad de estos coches, **dónde es solo se sabe después de
llamar**.

---

## De un vistazo

:::flujo
erp: Astara y Leasys están dadas de alta, con su teléfono
@ Proveedores → su ficha
+ nombre fiscal, CIF, teléfono, persona de contacto y horario
cliente: Abre la oferta y pide visita a una hora
@ En PopCar, no en el ERP — la pestaña Ex-Renting del **Marketplace**
+ nada: la elige él, y siempre queda pendiente
sistema: Queda pendiente de aprobación, marcada como **Ex-renting**
@ Agenda → el bloque de arriba, «visitas por confirmar»
+ nada: entra sola
trabajador: Se llama a la empresa. El sistema no le avisa nunca
@ Agenda → la visita → el teléfono de «Vende», pinchable
+ nada: se llama, y de ahí sale también dónde está el coche
erp: Si dicen que sí, se confirma **con la dirección**
@ Agenda → la visita → «Confirmar»
+ dónde es y por quién preguntar, que aquí casi nunca se saben antes
erp: Si dan otras horas, se le preguntan al cliente
@ Agenda → la visita → «Propone otras horas»
+ día y hora de cada una, hasta seis
erp: Si el coche ya no está, se cancela y se quita el anuncio
@ Agenda → la visita → «Cancelar cita»
+ el motivo, y la casilla de quitar el anuncio
erp: Se apunta lo hablado por teléfono
@ Agenda → la visita → «Ver rastro»
+ los dos botones de la llamada, y una nota con lo que dijeron
erp: Y cuando pasa el día, se dice cómo acabó
@ Agenda → «visitas por cerrar» → «No fue», «Fue a verlo» o «Fue y se lo quedó»
+ nada: son tres botones, y uno de ellos es la venta
:::

Nueve pasos, los mismos que con un concesionario. Lo que sigue es solo lo que
cambia; el resto está en el manual de concesionario y no se repite aquí.

---

## 1 · Antes de nada: a quién se llama

**Ninguna de las 182 ofertas trae teléfono.** Así que, tal y como está hoy, la
primera visita a un coche de Astara o de Leasys no tiene a quién llamar.

:::flujo
erp: Dar de alta la empresa, si no lo está
@ Proveedores → «Nuevo proveedor»
+ nombre fiscal y tipo «Vendedor»; el comercial, si el anuncio la llama de otra forma
erp: Rellenar su ficha
@ Proveedores → su ficha
+ CIF, dirección, teléfono, persona de contacto y horario
erp: O apuntar el teléfono desde la propia visita, que la da de alta
@ Agenda → la visita → «sin teléfono · apuntarlo»
+ el teléfono y, si hay alguien fijo, por quién preguntar
:::

> **Con una vez basta para toda la flota.** El teléfono es de la empresa, no del
> coche: puesto el de Astara, sus 95 ofertas quedan cubiertas, y también las que
> entren mañana.

> **El nombre del anuncio y el fiscal pueden no ser el mismo.** En la ficha,
> «Nombre fiscal» es el que se imprime en una factura y «Nombre comercial» es
> con el que vienen escritos los anuncios — aquí, «Astara» y «Leasys». Hacen
> falta los dos cuando no coinciden.

> **Y si un coche concreto está en otro sitio con otro número**, ese se pone en
> la ficha de esa oferta, en Marketplace, y manda sobre el de la empresa.

---

## 2 · La llamada, que aquí decide más cosas

Con un concesionario se llama para preguntar si el coche sigue y cuándo puede
verse. Aquí se llama para eso **y para saber dónde está**.

:::flujo
erp: Abrir la visita y mirar quién vende
@ Agenda → el bloque de arriba → la línea «Vende»
+ nada: sale el nombre, la marca «Ex-renting» y el teléfono
trabajador: Llamar y preguntar tres cosas
? ¿Qué contestan?
rama Que sí | Confirmar | Se apunta **dónde es** y por quién preguntar, y queda confirmada
rama Otras horas | Propone otras horas | Sigue **pendiente**: se le preguntan al cliente
rama Ya no está | Cancelar cita | Se cancela con motivo, y se marca quitar el anuncio
:::

Las tres cosas que hay que preguntar, en este orden:

1. **Si el coche sigue disponible.**
2. **Dónde se puede ver** — la dirección exacta, no la provincia.
3. **Por quién hay que preguntar** al llegar.

> **Dónde es importa más que con un concesionario.** Un concesionario tiene
> tienda y el cliente la encuentra en un mapa. Aquí el coche está donde la
> empresa lo tenga: un centro logístico, una campa, la sede de un colaborador.
> **83 de las 182 ofertas dicen «Toda España»**, que no es un sitio.

> Se puede confirmar sin dirección, y entonces al cliente se le dice que se la
> daremos antes de la visita — **y hay que dársela**, con «Apuntar el sitio».
> Con un ex-renting eso deja de ser la excepción: es lo normal.

---

## 3 · Las horas, que casi siempre se las inventa el sistema

:::flujo
sistema: Si la oferta no tiene franjas, genera huecos de lunes a viernes de 9 a 18
erp: La visita sale marcada como «hora propuesta por el sistema»
@ Agenda → el bloque de arriba, la etiqueta ámbar
:::

> **Con ex-renting esa marca es lo normal**, no la excepción: estas ofertas no
> traen disponibilidad publicada. Quiere decir que esa hora **no la ha acordado
> nadie** — ni la empresa ni nosotros—, así que al llamar hay que dar por hecho
> que habrá que proponer otra.

Publicar franjas de verdad se hace en **Marketplace → la oferta →
«Disponibilidad y citas»**, cuando la empresa diga cuándo se puede ir.

---

## 4 · El informe de DEKRA

Estos coches llevan un informe de inspección, y el enlace de **origen** de la
oferta lleva a él en vez de a un anuncio.

:::flujo
erp: Mirar el informe antes de contestar al cliente
@ Agenda → la visita → el enlace «origen»
+ nada: se abre en otra pestaña
:::

> **No se le reenvía al cliente.** Hoy no se le enseña, y algunos piden usuario
> para abrirse. Si pregunta por el estado del coche, se mira el informe y se le
> contesta con lo que ponga — no se le manda el enlace y que se apañe.

---

## 5 · Lo que es igual que con un concesionario

No se repite aquí porque no cambia nada. Está en el manual **Flujo marketplace
— concesionario**:

| Qué | Dónde está contado |
|---|---|
| Proponerle otras horas al cliente | Sección 3 |
| Apuntar el sitio y mover la cita | Sección 4 |
| El rastro y las notas | Sección 5 |
| Cerrar la visita: no fue, fue, se lo quedó | Sección 6 |
| Si el cliente se cambia la hora | Sección 8 |

---

## 6 · Y si se lo queda

La venta aparece en **Comisiones** igual que la de un concesionario, con el
mismo fee de 200 €.

:::flujo
erp: Emitir la factura
@ Comisiones → la venta → «Emitir la factura»
+ nada: el importe sale del fee, y se puede cambiar al emitir
erp: Y mandársela, que es descargar el PDF
@ Facturación clientes → la factura → descargar el PDF
+ nada: al descargarlo sale el correo con el adjunto y queda marcada
:::

> **Emitirla no es mandarla**, igual que con un concesionario. A Astara o Leasys
> no le llega nada hasta que alguien descarga el PDF, y el correo sale al que
> tengan puesto en su ficha de **Proveedores**. Mientras tanto sale en
> **Pendientes** como «facturas emitidas sin enviar».

> **Con Astara y Leasys no hay nada acordado todavía.** Los 200 € son la cifra
> provisional que se puso para los concesionarios, y aquí sale la misma porque
> el ERP no distingue. Si el acuerdo con una empresa de renting es otro
> —un porcentaje, o nada—, se cambia el importe al emitir. Antes de emitir la
> primera, conviene saber qué se ha firmado.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Los coches | **Marketplace → VO Empresas Renting** |
| El teléfono y el correo de la empresa | **Proveedores** → su ficha. El correo es al que sale su factura |
| Las facturas emitidas que no se han mandado | **Dashboard → Pendientes**, y la lista en **Facturación clientes** |
| El de un coche suelto | **Marketplace** → la oferta → «Teléfono de quien vende» |
| Las visitas por confirmar | **Agenda**, bloque de arriba, con la marca «Ex-renting» |
| El informe de DEKRA | **Agenda** → la visita → enlace «origen» |
| Publicar horarios reales | **Marketplace** → la oferta → «Franjas horarias» |
