# DILESA — Captura por fase (template para Beto)

> **Cómo usar este doc**: para cada fase, revisa los **docs requeridos** y los
> **campos requeridos**. Edita libremente (agregar, quitar, mover, comentar).
> Cuando esté completo, dime "ya" y arranco Sprint 7 con este alcance.
>
> Marcado `?` = duda mía, confirma.
> Marcado `[ ]` = preguntas abiertas.

## Reglas generales (validar)

- **Enforcement estricto**: una fase NO se puede cerrar si falta algún doc requerido o campo requerido. Mensaje claro al usuario: "Falta: contrato firmado, fecha de firma".
- **Orden estricto**: fase N+1 NO se abre hasta que N esté cerrada. Botón "Capturar fase N+1" deshabilitado con tooltip.
- **Desasignación**: solo el rol `comite` puede desasignar. Al hacerlo:
  - `estado` pasa a `'desasignada'`
  - `unidad_id` → null (libera el inventario)
  - Se borran las `venta_fases` (todo el avance)
  - Se borran los `venta_pagos`
  - ¿Se borran los adjuntos? **[ ]** ¿o se conservan como histórico?
  - La persona (cliente) en `erp.personas` se **conserva** intacta para re-asignación a otra unidad
  - Se llena `motivo_desasignacion` (texto libre)

## Roles → Fases que captura cada uno

| Fase                          | Vendedor | Gerencia Ventas | Administración | Contabilidad | Obra | Comité |
| ----------------------------- | :------: | :-------------: | :------------: | :----------: | :--: | :----: |
| 1. Solicitud de Asignación    |    ✓     |                 |                |              |      |   ✓    |
| 2. Asignada                   |          |        ✓        |                |              |      |   ✓    |
| 3. Formalizada                |    ✓     |                 |                |              |      |   ✓    |
| 4. Solicitud de Avalúo        |          |                 |       ✓        |              |      |   ✓    |
| 5. Avalúo Cerrado             |          |                 |       ✓        |              |      |   ✓    |
| 6. Inscrita                   |          |                 |       ✓        |              |      |   ✓    |
| 7. Solicitud de Dictaminación |    ✓     |                 |                |              |      |   ✓    |
| 8. Dictaminada                |    ✓     |                 |       ✓        |              |      |   ✓    |
| 9. Validación Patronal        |          |                 |       ✓        |              |      |   ✓    |
| 10. Firmas Programadas        |          |                 |       ✓        |              |      |   ✓    |
| 11. Escriturada               |          |                 |       ✓        |              |      |   ✓    |
| 12. Detonada                  |          |                 |                |      ✓       |      |   ✓    |
| 13. Facturada                 |          |                 |                |      ✓       |      |   ✓    |
| 14. Preparada para Entrega    |          |                 |                |              |  ✓   |   ✓    |
| 15. Entregada                 |    ✓     |                 |                |              |      |   ✓    |
| 16. Comisión Pagada           |          |                 |                |      ✓       |      |   ✓    |
| 17. Operación Terminada       |          |        ✓        |                |              |      |   ✓    |

**¿Cuadra? Ajusta los checks libremente.**

Aparte de capturar, **todos los roles** pueden ver todas las ventas EXCEPTO:

- `vendedor` solo ve **sus propias ventas** (las que él generó).

---

## Detalle por fase

### Fase 1 — Solicitud de Asignación

- **Rol**: Vendedor
- **Docs requeridos**:
  - [ ] `solicitud_asignacion` (PDF firmado por cliente)
- **Campos requeridos**:
  - Cliente (selección de `erp.personas` o crear nuevo con: nombre, apellidos, CURP, RFC, NSS, INE, fecha nac, tel, email, domicilio)
  - Unidad asignada (selección de `dilesa.unidades` disponibles)
  - Fecha de solicitud
  - Tipo de crédito
- **Notas**:
  - [ ] ¿Algo más?

### Fase 2 — Asignada

- **Rol**: Gerencia Ventas (autoriza la asignación)
- **Docs requeridos**:
  - [ ] `aviso_pld` (PDF firmado por cliente)
  - [ ] `aviso_privacidad`
  - [ ] `expediente_digital` (paquete KYC)
  - [ ] `ficu` ?
- **Campos requeridos**:
  - PEP (Sí/No)
  - Ocupación
  - Forma de pago
  - Uso de efectivo
  - Conocimiento del dueño beneficiario
  - Personalidad (física/moral)
  - Estado civil
- **Notas**:
  - [ ] ¿KYC completo aquí o se distribuye?

### Fase 3 — Formalizada

- **Rol**: Vendedor (con cliente firmando)
- **Docs requeridos**:
  - [ ] `contrato_promesa` (PDF firmado por ambas partes)
- **Campos requeridos**:
  - Precio de asignación
  - Descuento total (si aplica)
  - Enganche requerido
  - Fecha contrato
- **Notas**:
  - [ ] ¿Solo contrato o también algo más?

### Fase 4 — Solicitud de Avalúo

- **Rol**: Administración
- **Docs requeridos**: ninguno (solicitud verbal/email al perito)
- **Campos requeridos**:
  - Casa valuadora
  - Fecha solicitud
- **Notas**:
  - [ ] ¿Algún PDF que acompañe la solicitud?

### Fase 5 — Avalúo Cerrado

- **Rol**: Administración (cuando llega el avalúo del perito)
- **Docs requeridos**:
  - [ ] `avaluo_comercial` (PDF del perito)
- **Campos requeridos**:
  - Monto del avalúo
  - Valor comercial
  - Fecha de avalúo
- **Notas**: —

### Fase 6 — Inscrita

- **Rol**: Administración (registro público)
- **Docs requeridos**:
  - [ ] **¿?** — ¿constancia de inscripción del registro?
- **Campos requeridos**:
  - [ ] ¿Folio del registro?
  - [ ] ¿Fecha de inscripción?
- **Notas**:
  - [ ] Cuéntame qué pasa en esta fase

### Fase 7 — Solicitud de Dictaminación

- **Rol**: Vendedor (mete crédito al banco/institución)
- **Docs requeridos**:
  - [ ] **¿?** — ¿paquete completo al banco va como un PDF zip o algo?
- **Campos requeridos**:
  - Número de crédito titular (referencia que asigna el banco)
  - Institución (banco)
  - Número de crédito co-titular (si aplica)
  - Fecha solicitud
- **Notas**:
  - [ ] ¿Algo más?

### Fase 8 — Dictaminada

- **Rol**: Vendedor + Admin (cuando llega respuesta del banco)
- **Docs requeridos**:
  - [ ] `aprobacion_credito`
  - [ ] `constancia_credito_titular`
  - [ ] `constancia_credito_cotitular` (si aplica)
  - [ ] `carta_instruccion_notarial`
- **Campos requeridos**:
  - Monto crédito titular (aprobado)
  - Monto crédito co-titular (aprobado)
  - Fecha dictaminación
- **Notas**:
  - [ ] ¿Pasa si el banco no aprueba — la venta se desasigna o se reintenta?

### Fase 9 — Validación Patronal

- **Rol**: Administración
- **Docs requeridos**:
  - [ ] `validacion_patronal` (PDF)
- **Campos requeridos**:
  - Fecha validación
- **Notas**:
  - [ ] ¿Aplica solo para créditos Infonavit/Fovissste?

### Fase 10 — Firmas Programadas

- **Rol**: Administración (con notario)
- **Docs requeridos**: ninguno (calendario)
- **Campos requeridos**:
  - Notario asignado
  - Fecha programada de firma
- **Notas**: —

### Fase 11 — Escriturada

- **Rol**: Administración (post-notario)
- **Docs requeridos**:
  - [ ] `pagare` (firmado por cliente)
- **Campos requeridos**:
  - Número de escritura
  - Fecha de escritura
  - Gastos de escrituración
- **Notas**:
  - [ ] ¿La escritura misma (PDF) se sube aquí o en otra fase?

### Fase 12 — Detonada

- **Rol**: Contabilidad (cuando llega el dinero del crédito)
- **Docs requeridos**:
  - [ ] `imagen_detonacion` (comprobante de transferencia/depósito del banco)
- **Campos requeridos**:
  - Fecha detonación
  - [ ] ¿Monto detonado?
- **Notas**: —

### Fase 13 — Facturada

- **Rol**: Contabilidad
- **Docs requeridos**:
  - [ ] `factura` (PDF de la factura emitida)
  - [ ] `nota_credito` (si aplica)
- **Campos requeridos**:
  - Número de factura
  - Fecha factura
- **Notas**: —

### Fase 14 — Preparada para Entrega

- **Rol**: Obra / Construcción
- **Docs requeridos**:
  - [ ] `checklist_pre_entrega` (checklist firmada)
- **Campos requeridos**:
  - Fecha pre-entrega
  - [ ] ¿Observaciones?
- **Notas**: —

### Fase 15 — Entregada

- **Rol**: Vendedor (con cliente recibiendo)
- **Docs requeridos**:
  - [ ] `checklist_entrega` (checklist firmada por cliente al recibir)
- **Campos requeridos**:
  - Fecha de entrega
  - Observaciones del cliente (texto libre)
- **Notas**: —

### Fase 16 — Comisión Pagada

- **Rol**: Contabilidad
- **Docs requeridos**:
  - [ ] **¿?** — ¿recibo de pago al vendedor?
- **Campos requeridos**:
  - Comisión vendedor
  - Comisión gerencia
  - Anticipo de comisión (si ya se pagó parte antes)
  - Fecha pago final
- **Notas**: —

### Fase 17 — Operación Terminada

- **Rol**: Gerencia Ventas (cierre formal)
- **Docs requeridos**: ninguno
- **Campos requeridos**:
  - Fecha cierre
  - Notas finales (texto libre)
- **Notas**:
  - [ ] ¿Algún criterio para llegar aquí o solo cuando se completen las 16 anteriores?

---

## Preguntas globales

1. **Comisiones (fase 16)**: ¿el anticipo se paga en otra fase (al asignar?) o todo junto al final?
2. **Notario**: ¿se asigna en fase 10 o antes? ¿Hay catálogo de notarios o texto libre?
3. **Casa valuadora**: ¿catálogo o texto libre?
4. **Vendedores como usuarios**: cuando los demos de alta, ¿qué empresas necesitan ver? Solo DILESA o también RDB/ANSA?
5. **Re-asignación**: cuando un cliente desasignado se le asigna otra vivienda, ¿es una venta nueva (id nuevo) o se "revive" la vieja?

---

## Siguiente paso

Cuando llenes los `[ ]` y comentes los `?`, arranco con:

1. **Sprint 7** — RBAC: migración con 17 sub-slugs + 6 roles nuevos + setup de admin/comité.
2. **Sprint 8** — Forms por fase basados en este doc.
3. **Sprint 9** — Pulido (validaciones, desasignación, "mis pendientes" en home).
