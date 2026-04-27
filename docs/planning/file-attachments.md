# Iniciativa — File attachments (`<FileAttachments>`)

**Slug:** `file-attachments`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

> **Bloqueada hasta cierre de `print-pattern`.** Alcance v1 detallado
> se cierra cuando arranque su turno.

## Problema

Multiple módulos manejan adjuntos de archivos pero cada uno reinventó
upload + preview + delete + signed URLs:

- `components/documentos/documento-adjuntos.tsx` — adjuntos PDF/IMG.
- `components/rh/empleado-adjuntos.tsx` — INE, CURP, RFC, etc.
- OCR vouchers en cortes (Tesseract.js client-side, sube image y
  procesa).
- Marbete subido en levantamientos.
- Adjuntos en movimientos de inventario (chip 📎 entregado en
  `cortes-conciliacion`).
- Futuro: adjuntos en proyectos DILESA, en proveedores
  (`proveedores-csf-ai` probablemente sube CSF), en órdenes de
  compra.

Síntomas:

- Cada módulo implementa su propio flujo de upload (drag-drop o
  click-to-select), generación de signed URLs, preview, delete.
- Validación de tipo / tamaño dispersa.
- Manejo de progreso (% upload) implementado en algunos, ausente en
  otros.
- Multi-archivo vs single-archivo: APIs distintas.
- Storage en Supabase storage — buckets y paths convencionales pero
  cada caller construye los paths a mano.

## Outcome esperado

- Componente `<FileAttachments>` con upload (drag-drop + click),
  preview multi-tipo (PDF, IMG, otros), delete con confirm.
- Hook `useSignedUrls` para resolver URLs firmadas (con cache + TTL
  awareness).
- Helper `lib/storage/` con convención de paths
  (`<bucket>/<empresa>/<entidad>/<id>/<filename>`).
- Validación tipada: `accept` (mime types), `maxSize`, `maxCount`.
- Progress visible en uploads largos (videos, PDFs grandes).
- Integración con `forms-pattern` (file inputs como parte del schema
  de form).
- ADR documentando convenciones de paths, tipos permitidos, tamaños
  máximos por contexto.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Auditar implementaciones actuales — qué buckets, qué paths,
      qué APIs de upload (signed URL upload vs server-side).
- [ ] Componente `<FileAttachments entity entityId accept maxSize maxCount>` con drag-drop + preview + delete.
- [ ] Hook `useSignedUrls(adjuntos)` que cachea + revalida.
- [ ] Helper `lib/storage/path.ts` con builders tipados.
- [ ] Migrar 2-3 callers como golden path: - probable: `documento-adjuntos` (multi-archivo). - probable: `empleado-adjuntos` (single-archivo por tipo).
- [ ] ADR documentando.

## Fuera de alcance

- OCR / extracción de contenido (cortes vouchers, proveedores CSF).
  Eso queda en cada caller — el componente solo maneja upload.
- Versioning de archivos (subir nueva versión y mantener histórico).
  Postergable.
- Generación de thumbnails server-side. v1 client-side `<img>` o
  `<embed>` para PDF.

## Métricas de éxito

- Cero implementaciones nuevas de upload + signed URL en módulos
  posteriores.
- Tiempo de agregar adjuntos a un módulo nuevo baja a ~10 líneas
  de JSX.
- Audit visual: drag-drop, preview y delete se ven idénticos en
  todos los módulos migrados.

## Riesgos / preguntas abiertas

- [ ] **Buckets existentes y políticas de Storage** — auditar antes
      de generalizar. Cada bucket tiene RLS distinto (algunos
      público, otros privado por empresa). El componente debe ser
      agnóstico al bucket pero respetar las políticas.
- [ ] **Server actions para signed URL** — Next.js App Router
      permite server actions; ¿el componente las usa o el caller
      pasa el endpoint?
- [ ] **Coordinación con `proveedores-csf-ai`** — ese va a subir
      CSF + extraer con AI. Ideal: este componente sale primero y
      el extract-csf endpoint usa el path estándar. Si CC arranca
      proveedores antes, retro-migrar el upload en el PR de adopción.
- [ ] **Mobile camera capture** — levantamientos físicos ya tiene
      patrón de captura mobile. Reutilizar o coordinar con
      `responsive-policy`.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
