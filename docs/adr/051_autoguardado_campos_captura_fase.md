# ADR-051 — Autoguardado de campos en las pantallas de captura de fase

- **Status**: Accepted
- **Date**: 2026-06-26
- **Authors**: Beto, Claude Code
- **Iniciativa**: [`dilesa-autoguardado-captura`](../planning/dilesa-autoguardado-captura.md)
- **Hermano de**: [`dilesa-ventas-captura-colaborativa`](../planning/dilesa-ventas-captura-colaborativa.md) (que hizo lo mismo para los **documentos**)

---

## Contexto

La iniciativa de captura colaborativa hizo que los **documentos** persistan al subirse (storage + `erp.adjuntos`), desacoplados del botón de avance de fase. Pero los **campos de información** (fechas, montos, referencias, notas) de las pantallas de captura siguen persistiendo **solo al presionar el botón que avanza la fase** (vía `marcarFase` con `camposVenta`).

Eso reproduce, para los campos, el mismo problema que ya se arregló para los archivos: si una persona captura datos pero no avanza la fase —porque el botón es de otro rol (fase 8: Gerencia captura, Dirección cierra), porque falta una precondición, o simplemente porque cambia de pantalla— **pierde lo tecleado**. Beto (2026-06-26): _"hay que ver todos los campos igual que los archivos para que persistan"_.

La **fase 10 (Firmas Programadas)** ya resolvió esto para `fecha_firma_programada`/`hora_firma_programada` con un autoguardado debounced (`persistFirma` + un `useEffect` de 600 ms). Este ADR **generaliza ese patrón** a todas las fases que capturan campos.

## Decisión

**D1 — Autoguardado debounced, transparente (sin botón "Guardar borrador").** Cada campo de captura persiste solo, ~700 ms después del último cambio, igual que un documento persiste al soltarlo. Un indicador discreto muestra `Guardando… / Guardado ✓ / Error`. No se agrega un botón explícito de guardado: el principio es "lo que tecleas no se pierde", sin pasos extra.

**D2 — Hook reusable `useAutoguardadoCampos` + `<IndicadorAutoguardado>`.** El patrón vive en `components/dilesa/captura/autoguardado-campos.tsx` (en `components/` porque el indicador lleva JSX): el hook recibe una **firma** de los valores actuales, la firma de lo último guardado, una función `guardar()` y un flag `habilitado`; orquesta el debounce, el de-dup (no guarda si nada cambió) y el estado (`idle/guardando/guardado/error`). Cada fase provee su `guardar()` — así el hook no sabe de tablas ni RPCs.

**D3 — Respeta la capa de escritura existente (no UPDATE pelón donde hay auditoría).** El `guardar()` de cada fase usa el **mismo camino que hoy**: UPDATE directo a `dilesa.ventas` para campos simples (fechas, refs, montos administrativos), pero la **RPC auditada** donde ya existe — `fn_actualizar_descuentos_venta` (descuento, fase 3), `fn_corregir_avaluo_venta` (avalúo, fase 5). El autoguardado NO debe saltarse el audit trail ni las validaciones de negocio.

**D4 — Separación captura ↔ avance.** Con los campos ya persistidos, el botón de avanzar (`marcarFase`) deja de ser el que los guarda: pasa `camposVenta` redundante o vacío y su rol queda **solo avanzar la fase** (insertar la fila en `venta_fases` + correr los triggers de avance). Las **validaciones** del avance (campos requeridos, gates) se mantienen — leen el estado ya persistido.

**D5 — El gate de rol se respeta por fase; en la fase 8, Gerencia autoguarda, Dirección cierra (Beto 2026-06-26).** El autoguardado hereda el gate de cada pantalla:

- Fases sin separación de roles: autoguarda quien tiene escritura (= quien avanza).
- **Fase 8 (dictaminación):** los **datos del dictamen** (montos de crédito, referencias, gastos, valor de escrituración — los del Anexo B) **autoguardan al teclearlos Gerencia**; la **cuadratura, el pagaré/crédito directo y el avance** siguen siendo **solo de Dirección** (ADR-048 intacto). Gerencia ya no pierde lo capturado; Dirección mantiene el control del cierre financiero.
- Fase 10: ya implementado — Dirección puede editar la fecha aun congelada; los demás no (lock `fechaBloqueada`). El hook respeta ese `habilitado=false`.

**D6 — Sin cambios de schema.** El autoguardado escribe en las columnas/RPCs que ya existen. Es un cambio de **momento de escritura** (al teclear, no al avanzar), no de modelo de datos.

## Patrón de implementación (resumen)

```ts
// La fase mantiene el estado de los campos + lo "persistido" (de la venta).
const estado = useAutoguardadoCampos({
  clave: JSON.stringify({ fecha, monto }),          // firma de lo actual
  claveGuardada: JSON.stringify(persistido),        // firma de lo último guardado
  habilitado: puedeEscribir && !bloqueado,
  guardar: async () => {
    const { error } = await sb.schema('dilesa').from('ventas')
      .update({ ... }).eq('id', ventaId);           // o la RPC auditada
    if (error) return { ok: false, error: error.message };
    setPersistido({ fecha, monto });                // refresca la firma guardada
    return { ok: true };
  },
});
// <IndicadorAutoguardado estado={estado} /> junto al título de la sección.
```

## Rollout (rollout por fases — riesgo financiero acotado)

- **Sprint 1 — patrón + piloto + fases simples:** hook + indicador + las fases que solo capturan fechas/refs/notas, sin RPC ni gate financiero: **9** (piloto), **4, 7, 11, 15**.
- **Sprint 2 — campos con RPC auditada:** **3** (descuento → `fn_actualizar_descuentos_venta`), **5** (avalúo → `fn_corregir_avaluo_venta`).
- **Sprint 3 — financieras con gate:** **6** (montos de crédito), **8** (Gerencia autoguarda los datos del dictamen, Dirección cierra — D5), **12** (detonación manual), **16** (encuesta → `venta_encuestas`).

## Consecuencias

- Lo que cualquier rol teclea en una pantalla de captura sobrevive a salir sin avanzar — paridad con los documentos.
- La fase 8 deja de perder lo que captura Gerencia, sin ceder el control del cierre a nadie más que Dirección.
- Un patrón único (hook + indicador) en vez de re-implementar el debounce por pantalla.
- Riesgo acotado: el rollout va de las fases triviales a las financieras; las de RPC/gate se tratan aparte y se verifican contra su audit trail.

## Alternativas consideradas

- **Botón "Guardar borrador" explícito** (sin avanzar): descartado — agrega un paso y no cumple "que no se pierda" de forma transparente; los documentos no piden un botón para persistir.
- **Persistir en cada `onChange` sin debounce**: descartado — una escritura por tecla satura la DB y dispara triggers de más; el debounce de ~700 ms es el equilibrio que ya probó la fase 10.
- **UPDATE directo en todas, ignorando las RPCs auditadas**: descartado (D3) — perdería el rastro de cambios en descuento/avalúo, que es justo lo que el negocio audita.
