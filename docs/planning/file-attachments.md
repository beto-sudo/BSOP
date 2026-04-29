# Iniciativa — File attachments (`<FileAttachments>`)

**Slug:** `file-attachments`
**Empresas:** todas
**Schemas afectados:** n/a (UI; consume `erp.adjuntos`)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-29

## Problema

Múltiples módulos manejan adjuntos pero cada uno reinventó upload +
preview + delete + signed URLs. Path construction inconsistente
(timestamp prefix opcional, filenames no sluggificados), UI dispar
(drag-drop vs click-only), delete con `window.confirm()` legacy en
algunos, etc.

## Outcome esperado

- Convenciones documentadas: bucket, paths, tabla, roles, helpers de read.
- Helper `buildAdjuntoPath()` para path canónico.
- Componente `<FileAttachments>` (Sprint 2) con drag-drop + preview + delete.
- Adopción incremental.

## Alcance v1 (cerrado 2026-04-29 — ver ADR-022)

- [x] ADR-022 codifica las 6 convenciones (FA1-FA6).
- [x] `lib/storage/path.ts` con `buildAdjuntoPath()` + `slugifyFilename()` + tests.
- [x] `lib/adjuntos.ts` (read helpers) confirmado como single point para reads.
- [ ] `<FileAttachments>` componente — Sprint 2 (postponed).
- [ ] Migrar uploaders existentes a `buildAdjuntoPath()` — Sprint 2+.

## Decisiones tomadas al cerrar alcance

- **Foundation policy primero, componente después**: el path/bucket/tabla
  ya está consolidado en el repo (cada uploader lo respeta); el churn
  está en la UI de upload + path construction. ADR codifica lo primero;
  componente Sprint 2 cubre lo segundo.
- **Bucket único `adjuntos`**: no fragmentar por entidad. Todas las
  entidades comparten el mismo bucket privado con paths jerárquicos.
- **Path con timestamp prefix** previene colisiones por filenames idénticos
  subidos al mismo `entidadId` (e.g. "ine.jpg" subido dos veces al mismo
  empleado).
- **Sin componente en v1**: extraer `<FileAttachments>` requiere consolidar
  3 patrones de UI distintos (documentos, empleado-adjuntos,
  voucher-uploader) — alcance grande, postergable sin bloquear otras
  iniciativas.

## Fuera de alcance v1

- **Componente `<FileAttachments>` con UI consolidada** — Sprint 2.
- **Versioning de archivos**.
- **OCR / extracción** — vive en cada caller.
- **Mobile camera capture** estandarizado.
- **Server actions para signed URL**.

## Métricas de éxito

- `buildAdjuntoPath()` usado en uploaders nuevos (post Sprint 2 migration).
- Cero `window.confirm()` para delete de adjuntos.
- Path construction consistente en todo el repo.

## Sprints / hitos

| #   | Sprint                                    | Estado    | PR  |
| --- | ----------------------------------------- | --------- | --- |
| 1   | Foundation policy + ADR-022 + path helper | done      | TBD |
| 2   | Componente `<FileAttachments>` + golden   | postponed | —   |
| 3   | Migrar uploaders existentes               | postponed | —   |

## Decisiones registradas

### 2026-04-29 · ADR-022 — File attachments policy (Sprint 1)

Codificado en [ADR-022](../adr/022_file_attachments.md). Las 6 reglas:

- **FA1** — Bucket único `adjuntos` privado; reads via proxy `/api/adjuntos/<path>`.
- **FA2** — Path canónico `<empresa>/<entidad>/<entidadId>/<timestamp>-<slug>.<ext>`.
- **FA3** — Tabla `erp.adjuntos` como single source of truth de metadata; persistir solo el path.
- **FA4** — Roles canónicos por entidad (documentos: principal/imagen/anexo; empleados: ine/curp/etc.).
- **FA5** — Delete via `<ConfirmDialog>` (ADR-008); soft/hard según entidad.
- **FA6** — Read flows usan `lib/adjuntos.ts`; nunca construir URLs ad-hoc.

## Bitácora

### 2026-04-29 — Sprint 1 mergeado

Foundation:

- `lib/storage/path.ts` — `buildAdjuntoPath()` con timestamp prefix +
  `slugifyFilename()` con normalización ASCII + diacritics strip.
- `lib/storage/path.test.ts` — 11 tests cubren slugify edge cases +
  build path con/sin timestamp.
- `lib/storage/index.ts` — barrel export.
- ADR-022 con 6 reglas (FA1-FA6).

Sin migración masiva: los uploaders existentes siguen como están. La
adopción del helper + del componente `<FileAttachments>` es Sprint 2+.

PR: pendiente.
