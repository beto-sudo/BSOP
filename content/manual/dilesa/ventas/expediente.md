---
titulo: 'Ventas — Expediente de Operación'
modulo: dilesa.ventas
version: '1.1.0'
actualizado: '2026-06-16'
---

## ¿Qué es y para qué sirve?

Es el **expediente completo de una venta**: en una sola pantalla ves al
cliente, la vivienda, el dinero, los documentos y el avance del proceso.
Todo lo que pasa con la operación —desde la solicitud hasta la entrega—
se trabaja y se consulta aquí.

## Cómo llegar

**Sidebar → DILESA → Inmobiliario → Ventas** → clic en cualquier venta de la
lista (o desde Clientes → el cliente → su venta).

## Las partes de la pantalla

- **Cabecera (siempre visible)** — cliente (con CURP e **INE**), vivienda
  (proyecto · manzana/lote · prototipo), datos comerciales (precio, vendedor) y
  la **mini-cuadratura**: Precio | Crédito | Depósitos | Crédito directo |
  **Saldo**. El semáforo verde significa que el dinero ya cubre el valor de la
  operación. Cuando la operación cierra (Fase 17), la cabecera muestra el badge
  **Terminada**.
- **Línea de tiempo (las 17 fases)** — agrupadas en 5 etapas: **Comercial**
  (1-3), **Crédito** (4-9), **Cierre legal** (10-12), **Administrativo** (13) y
  **Entrega** (14-17). Cada fase muestra ✓ si ya se cerró y su fecha.
- **Pestañas**:
  - **Operación** — datos del cliente y de la venta + el pipeline con sus
    documentos (los chips grises son documentos que faltan).
  - **Cuadratura** — todo el dinero de la operación reconciliado (ver abajo).
  - **Documentos** — el expediente digital agrupado por etapa.
  - **Bitácora** — quién cerró cada fase y cuándo.

## La Cuadratura (cómo se lee el saldo)

La Cuadratura concilia el dinero contra el **valor de escrituración**. El número
que importa es el **saldo efectivo**: lo que realmente falta por cubrir.

- **Saldo de cobranza** — valor de escrituración menos lo recibido (depósitos +
  crédito + crédito directo). Es el saldo "en crudo", para auditoría.
- **Descuento aplicado** — el descuento otorgado al cliente, **topado al máximo
  de la promoción**. Lo que se perdona ya no cuenta como deuda.
- **Cheque a notaría** — el cheque realmente girado (capturado en la Fase 11).

El **saldo efectivo** es el saldo de cobranza menos el descuento aplicado más el
cheque girado. Si queda en cero (con una pequeña tolerancia que absorbe
redondeos), la operación está **cubierta**.

> **Editar los descuentos es solo de Dirección.** Los montos de descuento se
> ajustan desde la pestaña Cuadratura; el cambio queda auditado. Cuando una
> venta tiene factura, la Cuadratura toma el **valor facturado** y la **nota de
> crédito del CFDI** (no de una estimación).

## Cómo avanzo una venta de fase

1. En el pipeline, ubica la **fase actual** (la primera sin ✓).
2. Clic en **Capturar fase** — se abre la pantalla de esa fase con sus campos y
   documentos. (Cada fase tiene su propia ayuda: abre el "?" estando ahí.)
3. Llena lo requerido y sube los documentos: **cada documento se guarda en el
   expediente en cuanto lo subes** (no se pierde si sales sin cerrar, y queda
   registrado quién lo subió). Cuando la fase tiene todo, **guarda**: se cierra
   con fecha y tu nombre en la Bitácora.

Como los documentos se guardan al subirse, **varias personas pueden ir
aportando** a una misma fase en momentos distintos antes de cerrarla.

Las fases se cierran **en orden**. Si el botón Capturar no aparece, es porque la
fase anterior sigue abierta, o tu perfil no captura esa fase (cada fase tiene su
responsable — ver la tabla de abajo).

**Ver o corregir una fase cerrada.** Las fases ya cerradas muestran el botón
**"Ver / corregir"**: puedes consultarlas y, en las que lo permiten (por
ejemplo el número de escritura en la Fase 11), corregir un dato sin reabrir el
proceso. La corrección queda registrada.

## ¿Qué fase le toca a quién?

| Etapa          | Fases                              | Quién captura                                        |
| -------------- | ---------------------------------- | ---------------------------------------------------- |
| Comercial      | 1 Solicitud                        | **Vendedor**                                         |
| Comercial      | 2 Asignada (autorización)          | Dirección                                            |
| Comercial      | 3 Formalizada                      | Gerencia Ventas                                      |
| Crédito        | 4-9 (avalúo → validación patronal) | Gerencia Ventas                                      |
| Cierre legal   | 10-11 (firmas → escriturada)       | Gerencia Ventas / Dirección                          |
| Cierre legal   | 12 Detonada                        | Se cierra sola (abono de la institución en Cobranza) |
| Administrativo | 13 Facturada                       | Contabilidad                                         |
| Entrega        | 14 Preparada                       | Obra                                                 |
| Entrega        | 15 Entregada                       | **Vendedor** + Atención a Clientes                   |
| Entrega        | 16 Conformidad                     | Se cierra sola (encuesta al cliente)                 |
| Entrega        | 17 Terminada                       | Dirección (el sistema verifica todo)                 |

## El copiloto de cierre

Abajo del expediente, el **copiloto** te dice en lenguaje claro qué falta para
terminar la operación: fases pendientes, documentos faltantes, dinero por
cubrir y la conformidad del cliente. Si algo está pendiente, ahí lo ves sin
tener que revisar fase por fase.

## Preguntas frecuentes

**Soy vendedor y no veo una venta que busco.**
Los vendedores ven **solo sus propias ventas y clientes**. Si la venta es de
otro vendedor, no te aparece — es lo esperado.

**¿De dónde salen los depósitos de la cuadratura?**
De Cobranza (CxC): cada depósito del cliente registrado ahí aparece
automáticamente en el estado de cuenta y en la cuadratura de la venta.

**Capturé mal una fase, ¿puedo regresarla?**
Sí — Dirección puede regresar una fase desde el expediente; la corrección
queda registrada en la Bitácora. Avísale a tu gerente.

**¿Por qué un documento aparece en gris?**
Es un documento que esa fase espera y todavía no se sube. Al subirlo (en la
pantalla de captura de la fase) el chip se vuelve clickeable.

**No veo el botón para imprimir la Promesa de Compraventa (o la Póliza).**
Los botones de impresión aparecen cuando la venta llega a la fase que les
toca: la **Promesa de Compraventa** desde que la unidad queda **Asignada**
(fase 2), la **Póliza de Garantía** desde la **Validación Patronal** (fase 9),
y los checklists de entrega desde la Escritura (fase 11).

## Si algo no cuadra

Si el saldo de la cuadratura no baja con un depósito que sí se hizo, revisa
con Contabilidad que el pago esté registrado en **Cobranza**. Si una fase
quedó con fecha o monto equivocado, repórtalo a tu gerente para corregirla.
