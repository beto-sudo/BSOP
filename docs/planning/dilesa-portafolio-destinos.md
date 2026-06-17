# Iniciativa — Portafolio como destino (DILESA)

**Slug:** `dilesa-portafolio-destinos`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (nueva tabla catálogo `portafolio_destinos`; `activos.destino_id` FK + backfill desde `modalidad`; RPC `fn_liberar_unidad_portafolio` v2 — destino + liberar-desde-cualquier-estado + guard de venta activa; `unidades.es_muestra` data-fix de paridad con Coda; lectura `construccion.avance_pct` para la cápsula; lectura `ventas` para el guard). UI: `liberar-portafolio-dialog`, `portafolio-module`, `inventario-module`, form de nueva venta (`app/dilesa/ventas/nueva`).
**Estado:** in_progress
**Próximo hito:** Sprint 1 — catálogo de destinos + liberar-desde-cualquier-estado + fix de filtros de ventas + data-fix de las 21 demos (LDLE+LDS) al portafolio. Migración de schema y data-fix se aplican a prod con OK explícito de Beto.
**Dueño:** Beto
**Creada:** 2026-06-16
**Última actualización:** 2026-06-16 (promovida; arranca Sprint 1)

> **Continuación conceptual de** [`dilesa-portafolio-activos`](dilesa-portafolio-activos.md) (cerrada 2026-06-08, v1 = schema de activos + import Coda + UI lectura + RPC liberar↔portafolio). Aquella dejó el mecanismo bidireccional; ésta lo vuelve el **marcador canónico de "fuera del programa de venta de vivienda"** y le da un catálogo de destinos rico.

## Problema

Verificación 2026-06-16 (Coda en vivo + prod): en Coda hay **23 casas con `Demo=true`**; en BSOP **ninguna** está marcada (`es_muestra=0` en todo el sistema). El import inicial de inventario nunca trajo el flag. Además:

- Las **2 demos de Lomas del Valle (LDV)** ya están en el portafolio (Magnolias/Gardenia) pero sin la marca; las **21 de Lomas de los Encinos (LDLE, 10) + Lomas del Sol (LDS, 11)** —fraccionamientos activos— no están ni marcadas ni en el portafolio.
- La regla de liberación (`puedeLiberarse`) **bloquea unidades en construcción** — pero 9 de las demos de LDS están en obra y Beto las quiere fuera de ventas igual.
- El **marcador de "no disponible para venta" es inconsistente en código**: la vista Inventario excluye lo del portafolio (`activo_id`) pero el **form de captura de nueva venta no filtra ni `activo_id` ni `es_muestra`** → hoy una casa ya en portafolio seguiría apareciendo como asignable.
- El "destino" del activo es un CHECK fijo de 5 valores (`venta/renta/uso_propio/renta_venta/sin_definir`); Beto quiere más (Demo/Show House, Arrendamiento, Oficina, Bodega, Venta) y extensibilidad sin migración.

## Outcome esperado

El **portafolio es el lugar canónico** donde una unidad sale del programa de venta de vivienda normal y toma un destino propio:

1. Una unidad se puede traspasar al portafolio **desde cualquier estado de obra** (incl. en construcción); el portafolio muestra una **cápsula de avance** para saber que no está terminada.
2. El **destino es un catálogo extensible** (Demo/Show House, Arrendamiento, Oficina, Bodega, Venta fuera de programa, …), administrable sin migración, con flags (`cuenta_renta`/`cuenta_venta`) que alimentarán el futuro módulo de arrendamiento.
3. Estar en el portafolio **saca la unidad de ventas** de forma efectiva (form de captura + vista Inventario).
4. Las 23 demos de Coda quedan marcadas (`es_muestra`, paridad) y traspasadas al portafolio con destino Demo/Show House.

## Alcance

**Incluye (Sprint 1):** catálogo `portafolio_destinos` + `activos.destino_id`; RPC v2 (destino + cualquier estado + guard venta activa); dialog/módulo de portafolio + filtros de ventas; data-fix de las 23 demos.
**Después (Sprint 2+):** cápsula de avance en el detalle del activo; UI de administración del catálogo de destinos; reportes por destino; **módulo de arrendamiento** (consumidor de activos con `cuenta_renta=true`; aquí caerán bodegas y locales de plazas).
**Fuera:** contratos/cobranza de arrendamiento (vivirá en el módulo de arrendamiento, sprint propio).

## Riesgos

- **Liberar desde cualquier estado** podría sacar de ventas una unidad con venta activa → mitigado con guard en el RPC (bloquea si existe venta no cancelada/desasignada; admin override auditable).
- **Data-fix de inventario en prod** (mover 21 unidades) → se aplica solo con OK explícito de Beto; idempotente y reversible (`fn_regresar_unidad_proyecto` deshace).
- **`modalidad` legacy vs `destino_id`** → backfill 1:1; `modalidad` se conserva (derivada del destino) hasta un sprint de limpieza para no romper lecturas existentes.
- **Avance al liberar en construcción**: la unidad sale del denominador de avance de vivienda (correcto: ya no es vivienda para venta) — verificar que las vistas de avance lo reflejen.

## Métricas de éxito

- 23/23 demos de Coda marcadas `es_muestra` en BSOP; 21/21 (LDLE+LDS) en el portafolio con destino Demo.
- 0 unidades en portafolio visibles en el form de captura de venta.
- Catálogo de destinos administrable; ≥6 destinos seed.

## Sprints

- **Sprint 1** — catálogo + RPC v2 + filtros de ventas + data-fix de las 23 demos. _(in_progress)_
- **Sprint 2** — cápsula de avance en portafolio + UI de catálogo de destinos.
- **Sprint 3+** — módulo de arrendamiento.

## Bitácora

- **2026-06-16** — Promovida. Verificación previa: 23 demos en Coda (`Demo=true`), 0 marcadas en BSOP; cruce 100% por identificador (LDLE 10 terminadas / LDS 11 = 9 en obra + 2 terminadas / LDV 2 ya en portafolio). Confirmado gap en el form de nueva venta (no filtra `activo_id`/`es_muestra`).

## Decisiones registradas

- **2026-06-16 — Catálogo en tabla, no enum.** `dilesa.portafolio_destinos` con flags en vez de ampliar el CHECK de `modalidad`. Razón: Beto quiere agregar destinos sin migración y el módulo de arrendamiento filtrará por `cuenta_renta`.
- **2026-06-16 — El portafolio (`activo_id`) es el marcador de "fuera de ventas".** `es_muestra` se conserva para paridad de reporte con Coda (`v_proyecto_avances.casas_muestra`), pero el filtro operativo de ventas es `activo_id`.
- **2026-06-16 — Liberar desde cualquier estado físico**, con cápsula de avance en el portafolio (Beto: "no importa que no esté terminada"). Guard: bloquear si la unidad tiene venta activa.
- **2026-06-16 — Destino de las demos = Demo/Show House** (no renta). Migran a Arrendamiento cuando Dirección lo decida. Las 2 de LDV ya en portafolio se realinean a Demo.
