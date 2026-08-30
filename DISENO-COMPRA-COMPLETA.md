# Comprar un coche de principio a fin

Nota de diseño. El manual de los trabajadores vive en `docs/`; esto es para
decidir qué se construye y en qué orden.

Amplía `DISENO-PEDIDOS-GESTORIA.md`, que ya está hecho en sus dos primeras
partes: **Pedidos** y **Gestoría**. Lo que falta es todo lo que hay entre
encargar un coche y entregárselo a alguien.

---

## Lo que de verdad cambia según a quién se lo compres

Es tentador hacer un flujo solo y que cada origen sea una etiqueta. No vale: lo
que cambia no es el nombre, son **los papeles que hay que pedir, los riesgos que
hay que comprobar y los trámites que salen después**.

| | Alemania | Concesionario | Ex-renting | Particular |
|---|---|---|---|---|
| Quién vende | Empresa alemana | Empresa española | Empresa española | Una persona |
| El coche está | Matriculado en Alemania | Matriculado aquí | Matriculado aquí | Matriculado aquí |
| Lo que sale después | **Matricular** en España | **Transferir** | **Transferir** | **Transferir** |
| Riesgo principal | Que falte el COC | Poco | Cargas de la flota | **Cargas, deudas, multas** |
| Lo caro | Impuesto de matriculación y transporte | — | — | Impuesto de transmisiones |
| Transporte | Casi siempre | A veces | A veces | Casi nunca |

Tres consecuencias para el sistema:

1. **La lista de papeles que hay que reunir depende del origen.** No puede ser una
   casilla libre: tiene que venir puesta, y poder tocarse.
2. **Los trámites que se abren dependen del origen.** Un coche alemán se
   matricula; uno de aquí se transfiere. Ya lo hace para importación; falta el
   resto.
3. **Comprarle a un particular exige comprobar antes de pagar.** Es el único
   origen donde el coche puede venir con una carga o una deuda encima, y eso no
   se arregla después.

---

## El camino completo

```
Se decide comprar
      │
      ▼
  PEDIDO ──────────► lo que se le encarga a alguien, con su coste
      │              (Borrador → Pedido → Confirmado → En camino → Recibido)
      ▼
  TRANSPORTE ──────► traerlo, cuando no lo traes tú
      │              (Por organizar → Contratado → Recogido → En tránsito → Entregado)
      ▼
  RECEPCIÓN ───────► mirarlo al llegar, antes de firmar nada
      │              (fotos, kilómetros, llaves, daños)
      ▼
  GESTORÍA ────────► los papeles, uno por trámite
      │              (Pendiente → Enviado → En trámite → Resuelto)
      ▼
  ENTREGA ─────────► dárselo al cliente, con lo suyo en la mano
      │
      ▼
  COSTE Y MARGEN ──► qué ha costado de verdad y qué se ha ganado
```

Cada bloque es una pieza que se puede construir sola, y ninguna depende de que
las de después existan.

---

## 1 · Los documentos, por origen

Hoy los papeles se suben al expediente y ya. Falta lo importante: **saber cuáles
faltan**. Un coche no se puede matricular sin su ficha alemana, y eso hay que
verlo antes de tenerlo aparcado.

La idea: cada pedido nace con **su lista de papeles esperados**, según el origen.
Cada uno está o no está, y quien lo mire ve el hueco.

**De Alemania**

| Papel | Para qué | Sin él |
|---|---|---|
| Ficha del vehículo, partes I y II | Es el título de propiedad alemán | No se matricula |
| COC (certificado de conformidad) | Homologación europea | Hay que homologar unidad a unidad: caro y lento |
| Factura del vendedor | La compra | No hay nada que declarar |
| Contrato de compraventa | Lo acordado | — |
| Justificante de baja alemana | Que allí ya no está | Lo pide la matriculación |

**De un concesionario o un ex-renting**

| Papel | Para qué |
|---|---|
| Factura | La compra, con su IVA |
| Permiso de circulación | El coche |
| Ficha técnica | El coche |
| Contrato de compraventa | Lo acordado |
| Justificante de que no hay cargas | Que se puede transferir |

**De un particular**

Lo mismo, y además:

| Papel | Por qué |
|---|---|
| DNI del vendedor | Es quien firma, y tiene que ser el titular |
| Informe de la DGT | **Antes de pagar**: cargas, embargos, ITV, bajas |
| Último recibo del impuesto de circulación | Una deuda del ayuntamiento bloquea la transferencia |
| ITV en vigor | Sin ella no se transfiere |

Esa lista **se propone, no se impone**: se pueden añadir y quitar. Lo que no
puede es no estar.

### Los documentos, donde toquen

Hoy el almacén solo entiende de solicitudes. Tiene que entender de **pedidos, de
trámites y de transportes** también, y que un mismo papel —la ficha técnica—
pueda verse desde los tres sitios sin estar tres veces.

---

## 2 · Comprar a un particular: comprobar antes de pagar

Es el único origen que puede salir mal de forma irreversible, así que el sistema
tiene que ponerlo delante y no dejar avanzar a ciegas.

Antes de pasar el pedido a «Pedido», si el origen es particular, hay que haber
marcado:

- **Informe de la DGT pedido y sin cargas.**
- **El que firma es el titular.**
- **Sin deudas de impuesto de circulación.**
- **ITV en vigor** (o sabido y descontado del precio).

No es una casilla de conciencia: se guarda quién lo comprobó y cuándo. El día que
aparezca un embargo, la pregunta va a ser esa.

---

## 3 · Transporte

Un coche que viene de Alemania hace un viaje, y a veces dos. Hoy eso es una
etapa del expediente y nada más: no se sabe quién lo trae, cuánto cuesta ni
cuándo sale.

Un transporte tiene: **transportista**, **de dónde a dónde**, **cuándo se
recoge**, **cuándo se entrega**, **cuánto cuesta**, y **cómo llegó**.

Estados: *Por organizar → Contratado → Recogido → En tránsito → Entregado*.

Dos cosas que parecen detalles y no lo son:

- **Un pedido puede llevar varios tramos.** Alemania → almacén, almacén →
  taller, taller → cliente. Cada uno con su transportista y su coste.
- **Al recogerlo y al entregarlo hay que hacer fotos.** Es lo único que
  distingue un golpe que ya venía de uno que se hizo por el camino, y esa
  discusión llega siempre.

---

## 4 · Recepción: mirar el coche al llegar

El momento con más valor de todo el proceso, y el que hoy no existe. Cuando el
coche llega, alguien lo mira y anota:

- **Kilómetros** reales, comparados con lo que decía el anuncio.
- **Llaves**: cuántas hay. Una segunda llave cuesta cientos de euros.
- **Documentación** que venía dentro.
- **Daños**, con fotos.
- **Neumáticos, ITV, libro de mantenimiento.**

De ahí salen dos cosas: una reclamación al proveedor si no es lo que se compró,
y la ficha honesta del coche para venderlo.

**Si lo que llega no es lo que se compró, hay que poder decirlo**: una
incidencia, con lo que se reclama y en qué queda.

---

## 5 · Gestoría: lo que falta

Ya está la pieza. Le falta:

- **Sus documentos** — lo dicho arriba.
- **Coste y quién lo paga**: tasas, honorarios, impuestos. Va al coste del coche.
- **El resultado**: la matrícula que le han dado, y desde cuándo.
- **Aviso de lo que lleva parado**: hoy se ve en pantalla; debería avisar solo.

Y una cosa que no se puede olvidar: **el cliente ve avanzar su coche**. Cuando la
matriculación se resuelve, eso es una buena noticia y hoy no sale de aquí.

---

## 6 · Entrega

Entregar es un acto, no un estado. Hace falta:

- **Cita**: día, hora, sitio, quién atiende. (Ya está para importación.)
- **Lo que se le da**: permiso de circulación, ficha técnica, dos llaves, libro,
  factura, contrato, garantía. Una lista que se marca delante del cliente.
- **Firma de la entrega**, con la fecha.
- **Los kilómetros de salida.**

Y lo que empieza ahí: **la garantía**. Un coche entregado con garantía de doce
meses es una obligación con fecha, y hoy nadie la lleva.

---

## 7 · Lo que ha costado de verdad

Es lo que separa un ERP de una lista de tareas. Un coche acumula:

```
precio al proveedor
+ transporte (todos los tramos)
+ impuesto de matriculación
+ gestoría y tasas
+ reacondicionado (taller, ruedas, ITV)
= coste real
```

Y contra eso, lo que se cobró. **Margen por coche, y margen por origen**: cuál de
los cuatro caminos deja dinero de verdad, que hoy nadie sabe.

---

## 8 · Qué ve el cliente

No todo. La regla, que ya se aplica hoy y conviene escribir:

| Sí ve | No ve |
|---|---|
| En qué etapa está su coche | Quién es el proveedor |
| Cuándo se lo esperamos | Lo que nos costó |
| Sus facturas | Los papeles internos |
| Su matrícula, cuando la haya | Lo que se reclamó al vendedor |
| Su cita de entrega | Lo que gana PopCar |

---

## En qué orden lo haría

Por lo que más duele hoy, no por lo más bonito:

1. ~~**Documentos donde toquen y lista por origen.**~~ **Hecho.** El almacén
   entiende de solicitudes, pedidos y trámites, cada papel se sube diciendo cuál
   es, y cada pedido enseña lo que falta según a quién se le compró.
2. ~~**Trámites de los otros orígenes.**~~ **Hecho.** Al recibir un coche se
   abren los que le tocan según de dónde venga; al venderlo, su transferencia.
3. ~~**Comprobaciones del particular.**~~ **Hecho.** No se encarga un coche a
   una persona sin haber mirado las cuatro, y queda quién las miró.
4. **Transporte** con sus tramos, sus costes y sus fotos.
5. **Recepción** del coche.
6. **Coste y margen.**
7. **Entrega y garantía.**

Los tres primeros son de esta semana. Del cuarto en adelante, cada uno es un
bloque en sí mismo.
