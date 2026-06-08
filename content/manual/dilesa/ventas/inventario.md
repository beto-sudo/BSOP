---
titulo: 'Ventas — Inventario'
modulo: dilesa.ventas.inventario
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Es el inventario de **unidades disponibles para vender hoy**: solo aparecen las
que están **en construcción** (obra con 20% o más de avance) o **terminadas**. No
aparecen lotes planeados ni unidades ya vendidas.

## Cómo llegar

**Sidebar → DILESA → Inmobiliario → Ventas → pestaña Inventario.**

## Lo que ves arriba (indicadores)

- **Disponibles** — cuántas unidades vendibles hay.
- **En construcción** / **Terminadas** — el desglose.
- **Valor disponible** — la suma del precio de todo el inventario.
- **Días en inventario** — promedio (señal de estancamiento).

## La tabla

Cada renglón es una unidad: **Unidad**, **Proyecto**, **Prototipo**, **Área m²**,
**m² constr.**, **Características** (Esquina / Frente verde), el desglose de precio
(**Precio base**, **Excedente**, **Esquina**, **Frente verde**, **Venta futuro**) y
el **Total**, más el **Estado** y los **Días en inventario**.

## Lo que puedes hacer

- **Buscar / filtrar** — por unidad, proyecto, prototipo, características o fecha de
  ingreso.
- **Asignar** — el botón al final del renglón abre una **venta nueva** con esa
  unidad ya seleccionada.
- **Abrir una unidad** — clic en el renglón (no en "Asignar") muestra su detalle.

## Preguntas frecuentes

**El "Total" ¿incluye el crédito?**
No. Es el precio base para cotizar (terreno + características). Las opciones de
crédito se agregan al crear la venta.

**Una unidad en construcción muestra "0 días en inventario".**
Correcto: los días solo se cuentan **después** de que la obra termina
físicamente.

**Hice clic en "Asignar", ¿cambié la unidad?**
No. "Asignar" no modifica la unidad; solo abre una venta nueva con ella
preseleccionada.

## Si algo no cuadra

Si una unidad que crees disponible no aparece, revisa el avance de su obra (debe
estar en construcción ≥20% o terminada) en el módulo Construcción.
