# El día en el ERP

Los otros manuales cuentan un camino cada uno, de principio a fin. Éste cuenta
el orden en el que se abren las pantallas un día cualquiera, cuando hay cuatro
caminos abiertos a la vez y ninguno empieza por el principio.

Se lee una vez. Después se vive en **Pendientes**, que es lo que sabe qué toca.

---

## De un vistazo

:::flujo
erp: Se empieza por Pendientes, que dice qué hay hoy
@ Dashboard → Pendientes
+ nada: el número rojo de la pestaña se ve desde cualquier otra
erp: Las visitas por confirmar, y las que ya pasaron y nadie ha cerrado
@ Agenda
+ nada: son los dos bloques de arriba
erp: Lo que ha pedido gente por la web
@ Leads
+ nada: entran solos, y a las 24 horas laborables avisan
erp: Los coches que estamos vendiendo nosotros
@ IDCars → el coche → «Encargo de venta»
+ lo que le falte a cada uno: la lista se pinta sola
erp: Los expedientes de importación en marcha
@ Importaciones
+ lo que toque del paso en el que esté
erp: Lo que hay que cobrar y todavía no se ha facturado
@ Comisiones
+ nada: salen las ventas cerradas sin factura
erp: Y lo que está facturado y no se ha mandado
@ Facturación clientes
+ nada: mandarla es descargar su PDF
erp: Las facturas que nos tienen que llegar a nosotros
@ Facturación proveedores
+ el número, la fecha y el PDF de la que haya llegado
:::

> **Pendientes esconde lo que está a cero.** Al revés que los desgloses del
> negocio: una lista de tareas con nueve filas vacías se deja de leer. Que una
> línea no salga significa que ahí no hay nada que hacer.

> **El orden es fijo, no por cantidad.** Lo que cuesta dinero va primero aunque
> sea uno solo. Ordenado por cantidad, cuarenta citas taparían la factura que no
> se puede deducir.

---

## Los cuatro caminos

Cada uno tiene su manual. Lo que cambia entre ellos es de quién es el coche.

| El coche es de | Qué hacemos | Manual |
|---|---|---|
| Un particular, y nos encarga venderlo | Todo: precio, taller, anuncio, citas y papeles | **Flujo particular — «Nosotros lo vendemos por ti»** |
| Un concesionario | Concertar la visita y cobrar un fee por venta | **Flujo marketplace — concesionario** |
| Una empresa de renting | Lo mismo, con quien se llama y cómo cambia | **Flujo marketplace — ex-renting** |
| Nadie todavía: se trae de fuera | El expediente entero, de la puja a la entrega | **Flujo de importación** |

> **El particular tiene dos caminos, no uno.** El de este manual es el
> gestionado. Si publica él mismo su IDCar en el marketplace no hay mandato, ni
> taller, ni portales, ni factura: es más corto y no lleva encargo.

---

## Lo que vale para los cuatro

Son las cinco cosas que se olvidan igual en todos, y ninguna la hace el sistema
solo.

### Emitir una factura no es mandarla

:::flujo
erp: Emitir la factura
@ Comisiones → la venta, o el cierre del encargo en IDCars
+ nada: el importe sale del fee o del cierre
erp: Y mandarla, que es descargar el PDF
@ Facturación clientes → la factura → descargar el PDF
+ nada: al descargarlo sale el correo con el adjunto y queda marcada
:::

> **Son dos pasos y el segundo se olvida.** Emitir le pone número y la deja en
> Facturación; el correo sale al descargar el PDF. Mientras no se haya hecho,
> esa factura aparece en Pendientes como «facturas emitidas sin enviar».

> **A quién le llega depende de a nombre de quién esté.** La de gestión de venta
> y la de la venta del coche van al cliente. La comisión del concesionario, la
> del portal y el fee de renting van a la **empresa**, al correo de su ficha de
> **Proveedores** — en esas facturas el particular sale como dato del concepto,
> porque es la venta que justifica el cobro, no quien lo paga.
>
> **Si esa ficha no tiene correo, no se manda y no se marca.** Se queda en
> Pendientes hasta que se le ponga. No se manda al cliente para que salga algo:
> sería enseñarle a un tercero lo que cobramos y a quién.

### Toda visita se aprueba por teléfono

> El horario publicado no es un compromiso de quien vende. Confirmar una visita
> sin llamar es concertar una cita que la otra parte no sabe que tiene. La única
> excepción es el particular gestionado, que enseña su propio coche en las
> franjas que ha puesto él.

### Los portales son a mano, y nadie los vigila salvo el aviso

:::flujo
trabajador: Poner el anuncio en el portal
@ IDCars → el coche → «Encargo de venta» → «Anuncios en portales»
+ el enlace del anuncio, que es por donde se entra a borrarlo
erp: Y cuando el coche deja de estar publicado aquí, retirarlo allí
@ Dashboard → Pendientes
+ nada: el aviso sale solo al despublicarse
:::

> **El aviso mira el escaparate, no el estado del encargo.** Si el coche ya no
> está en nuestro marketplace tampoco puede estar en los de fuera, se haya
> caído por lo que se haya caído. El teléfono de ese anuncio es el nuestro: un
> anuncio vivo de un coche vendido lo pagamos y lo cogemos nosotros.

### Un gasto sin factura no se deduce

> Las facturas que esperamos —el taller, el perito, el transportista, la
> gestoría— entran solas como esperadas en cuanto se apunta el trabajo, y salen
> en Pendientes hasta que llegan. Cerrar el expediente no hace que dejen de
> faltar.

### Lo que pasa por teléfono no existe hasta que se escribe

> El rastro de una visita es donde vive lo que se habló. Un ERP que solo sabe lo
> que se pulsó no puede explicar por qué se movió una cita.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Qué hay que hacer hoy | **Dashboard** → Pendientes |
| Lo que pide la gente por la web | **Leads** |
| Las visitas: confirmar, mover y cerrar | **Agenda** |
| Los coches del marketplace y sus franjas | **Marketplace** |
| Los coches de un particular y su encargo | **IDCars** → el coche |
| Los expedientes de importación | **Importaciones** |
| Las fichas de empresas, con su CIF y su correo | **Proveedores** |
| Lo que hay que cobrar y no se ha facturado | **Comisiones** |
| Las facturas que emitimos, y mandarlas | **Facturación clientes** |
| Las que nos tienen que llegar | **Facturación proveedores** |
| Si un coche cuadra | **Dashboard** → Financiera → «Margen por coche» |
| De dónde viene la gente | **Analítica UTM** |
| Estos manuales, y bajarlos en Word | **Manual** |

---

## Cómo comprobar que sigue funcionando

Tres comprobaciones, todas contra la base de verdad y todas dentro de una
transacción que se deshace: no dejan ni una fila.

| Qué mira | Cómo se lanza |
|---|---|
| Que ninguna consulta del panel esté rota | `npm run test:panel` |
| El camino del particular gestionado, entero y en orden | `npm run test:flujo` |
| Todo lo demás | `npm test` |

> **El de flujo existe por un fallo concreto.** Cerrar el encargo no despublicaba
> el coche, y como el aviso de retirarlo del portal mira el escaparate, no
> saltaba nunca: la alarma montada y el sensor sin conectar. Cada pieza tenía su
> prueba y las dos estaban bien — el hueco estaba justo entre ellas, que es
> donde una prueba de unidad no mira.
