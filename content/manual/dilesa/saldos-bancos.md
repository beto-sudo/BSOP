---
titulo: 'Tesorería — Saldos Bancos'
modulo: dilesa.saldos-bancos
version: '2.0.0'
actualizado: '2026-06-11'
---

## ¿Qué es y para qué sirve?

El control de las **cuentas bancarias de DILESA**: saldo actual con
historial, ficha completa de cada cuenta, y el **archivo mensual de estados
de cuenta** con conciliación. Es la fuente del bloque "Saldos Bancos" del
**correo diario al Consejo**.

## Cómo llegar

**Sidebar → DILESA → Tesorería → Saldos Bancos.**

Dos pestañas: **Saldos** (captura diaria) y **Estados de cuenta** (archivo
mensual + conciliación).

## Pestaña Saldos

Una fila por **cuenta bancaria activa** con su último saldo capturado, la
fecha y la antigüedad del dato (para detectar cuentas con saldo viejo).

- **Capturar el saldo del día** de cada cuenta — se apila como un snapshot
  nuevo (no pisa el anterior: queda historial).
- **Ver el historial** de capturas por cuenta.
- **Ficha** — datos completos de la cuenta: número, CLABE (copiable con un
  clic), número de cliente, contrato, sucursal, teléfono y contacto del
  banco.

> **Monex:** el saldo a capturar es el **total** (saldo vista + posición en
> reporto), no solo lo que aparece como disponible. El estado de cuenta
> mensual valida esta captura.

## Pestaña Estados de cuenta

Archivo mensual: una fila por cuenta × mes con los totales de carátula y el
PDF original archivado.

**Para subir un estado de cuenta:**

1. Clic en **Subir estado de cuenta**.
2. Elige la **cuenta** y el **mes**.
3. Selecciona el **PDF** (se sube y queda archivado).
4. Clic en **Extraer datos del PDF** — la IA lee la carátula (~1 min) y
   prellena saldo inicial, depósitos, retiros, saldo final e inversiones.
5. **Revisa los montos contra el PDF** y guarda. También puedes capturar
   todo a mano sin extracción.

**La conciliación automática (3 checks por fila):**

- **Cuadra / No cuadra** — saldo inicial + depósitos − retiros = saldo
  final. Si no cuadra, hay un dedo equivocado en la captura.
- **Continuidad** — el saldo final del mes anterior debe ser el saldo
  inicial de este mes. Detecta meses faltantes o capturas erróneas.
- **= Captura** — el saldo al corte del estado vs el snapshot capturado en
  la pestaña Saldos ese día. Valida que la captura diaria va bien.

## Preguntas frecuentes

**¿Cada cuándo se captura el saldo diario?**
Idealmente a diario (el correo al Consejo sale cada mañana con el último
saldo disponible). La columna de antigüedad te dice si el dato ya está viejo.

**¿Cada cuándo se sube el estado de cuenta?**
Una vez al mes por cuenta, cuando el banco lo emite (primeros días del mes
siguiente). El KPI de cobertura te dice cuáles faltan.

**Me equivoqué en un mes ya guardado.**
Ábrelo (clic en la fila → Editar), corrige y guarda — se reemplaza la
captura de ese mes (cuenta + mes es único).

**¿Qué es "Inversiones al corte"?**
Para cuentas que invierten el saldo (Monex en reporto), el banco reporta el
saldo vista y la posición en inversiones por separado. El saldo real de la
cuenta es la suma de ambos.

**Falta una cuenta.**
Las cuentas se administran en la configuración de la empresa (cuentas
bancarias). Al activarla aparece aquí.
