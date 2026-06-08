---
titulo: 'Compras — Cotizaciones'
modulo: dilesa.compras.cotizaciones
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Son las **cotizaciones formales (RFQ)**: pides precio del mismo paquete a varios
proveedores, capturas sus respuestas, comparas lado a lado y **adjudicas** al
ganador. Al adjudicar se genera una **orden de compra** (si es de compra) o un
**contrato** (si es de obra).

## Cómo llegar

**Sidebar → DILESA → Compras → Cotizaciones.** Un proyecto a la vez.

## Lo que ves arriba (indicadores)

**RFQ**, **Abiertas**, **Adjudicadas** y **Adjudicado** (el monto del ganador).

## La tabla

Cada renglón: **Folio**, **Tipo** (Compra → OC / Obra → contrato), **Descripción**,
**Estado**, **Líneas**, **Respuestas** (cuántos proveedores ya contestaron de los
invitados) y **Límite** (fecha tope).

## Cómo funciona (paso a paso)

1. **Nueva cotización** → eliges **tipo** (compra u obra), agregas las **líneas** a
   cotizar (cada una con su partida y cantidad) e **invitas a los proveedores**.
2. Abre la cotización para **capturar la respuesta** de cada proveedor: precio por
   línea, monto total, condiciones y su archivo de propuesta.
3. **Compara** — el sistema resalta el mejor precio y ordena a los proveedores.
4. **Adjudica** al ganador → genera la **orden de compra** o el **contrato**, según
   el tipo.

## Estados

| Estado         | Significa                                  |
| -------------- | ------------------------------------------ |
| **Abierta**    | Invitados enviados, esperando respuestas.  |
| **Comparada**  | Ya llegaron respuestas, en análisis.       |
| **Adjudicada** | Elegido el ganador; se generó OC/contrato. |
| **Cancelada**  | Anulada (con motivo).                      |

## Preguntas frecuentes

**¿Cuál es la diferencia entre "Compra" y "Obra"?**
El **tipo** define qué se genera al adjudicar: una compra genera una **orden de
compra**; una obra genera un **contrato** de obra.

**Adjudiqué, ¿ya quedó comprada?**
Adjudicar **genera** la orden/contrato; la orden todavía hay que **enviarla** (en
la pestaña Órdenes) para que comprometa el presupuesto.

## Si algo no cuadra

Si no puedes comparar, asegúrate de haber **capturado las respuestas** de al menos
un proveedor.
