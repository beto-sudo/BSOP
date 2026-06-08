---
titulo: 'CxC — Saldos'
modulo: dilesa.cobranza.aging
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Es el **reporte de antigüedad de saldos por cobrar**: cuánto te debe cada cliente,
repartido por qué tan vencido está. Sirve para priorizar la cobranza. De **solo
lectura**.

## Cómo llegar

**Sidebar → DILESA → Administración → CxC → pestaña Saldos.**

## Cómo se lee

Cada renglón es un cliente y su saldo repartido por antigüedad:

| Columna     | Significa                                       |
| ----------- | ----------------------------------------------- |
| **Vigente** | Aún no vence (o sin fecha).                     |
| **1–30**    | Vencido de 1 a 30 días.                         |
| **31–60**   | Vencido 31 a 60 días (en **ámbar**).            |
| **61–90**   | Vencido 61 a 90 días (en **ámbar**).            |
| **>90**     | Vencido más de 90 días (en **rojo** — urgente). |
| **Total**   | La suma de ese cliente.                         |

Abajo, los **totales** de toda la cartera. Ordenado por el saldo más alto.

## Preguntas frecuentes

**Una celda muestra "—".**
Ese cliente no tiene saldo en ese rango de antigüedad.

**¿Aquí registro el cobro?**
No: es el diagnóstico. Para capturar un abono, ve a la pestaña **Pagos**.

## Si algo no cuadra

Es una "foto" del momento (se calcula al abrir). Tras registrar abonos, vuelve a
entrar para verlo actualizado.
