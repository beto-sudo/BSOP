---
titulo: 'Construcción — Contratos'
modulo: dilesa.construccion.contratos
version: '1.1.0'
actualizado: '2026-06-10'
---

## ¿Qué es y para qué sirve?

Son los **contratos con contratistas**, divididos en dos sub-vistas porque son
dos sistemas distintos:

- **Vivienda** — contratos de MO por lotes: agrupan uno o varios lotes a un
  precio de mano de obra y arrancan sus obras en una sola operación. Se pagan
  por **destajos semanales**.
- **Obra de proyecto** — urbanización, obra de cabecera y tareas menores. Su
  avance se devenga con **estimaciones de contrato** autorizadas por Dirección
  (guía propia: _Contratos de obra y sus estimaciones_).

## Cómo llegar

**Sidebar → DILESA → Inmobiliario → Construcción → pestaña Contratos** y elige
la sub-vista arriba.

## Lo que ves arriba (indicadores)

- En **Vivienda**: **Contratos**, **Valor total**, **Lotes asignados**,
  **Promedio por contrato** y **Top contratista**.
- En **Obra de proyecto**: **Contratos**, **Contratado**, **Devengado**
  (Σ estimaciones autorizadas), **Por devengar** y **Avance financiero**.
  Los cancelados se ven pero no suman.

## La tabla

- En **Vivienda**: **Código**, **Fecha**, **Contratista**, **Proyecto**,
  **Lotes** y **Valor MO** (mano de obra).
- En **Obra de proyecto**: **Código**, **Fecha**, **Contratista**, **Proyecto**,
  **Tipo**, **Contratado**, **Devengado** y **Por devengar**.

Un contrato cancelado aparece tachado con una etiqueta roja.

## Lo que puedes hacer

- **Buscar / filtrar** — por código, contratista, proyecto o rango de fechas.
- **Nuevo contrato + arranques** — formulario combinado que crea el contrato y
  arranca sus lotes de una vez.
- **Nuevo contrato de obra** — para un contrato de obra dedicado.
- **Abrir un contrato** — clic en el renglón para ver sus lotes, avance y números.

(Los botones de alta solo aparecen si tu rol tiene permiso de escritura.)

## Preguntas frecuentes

**Un contrato cancelado sigue apareciendo.**
Sí, a propósito (queda como rastro de auditoría), pero **no** suma en los
indicadores de valor.

**Un contrato no tiene lotes.**
Es válido; un contrato puede existir sin lotes asignados todavía.

## Si algo no cuadra

Si el valor o los lotes de un contrato se ven mal, ábrelo: ahí ves el detalle
lote por lote.
