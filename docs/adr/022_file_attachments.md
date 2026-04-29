# ADR-022 — File attachments (paths + bucket convention)

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `file-attachments`)
- **Related**: [ADR-016](./016_forms_pattern.md), [ADR-021](./021_print_pattern.md)

---

## Contexto

Múltiples módulos manejan adjuntos pero cada uno reinventó upload + preview + delete + signed URLs:

- `components/documentos/documento-adjuntos.tsx` — adjuntos PDF/IMG por documento legal con roles (`documento_principal` / `imagen_referencia` / `anexo`).
- `components/rh/empleado-adjuntos.tsx` — INE, CURP, RFC, foto, etc. por empleado.
- `components/cortes/voucher-uploader.tsx` — vouchers de tarjeta con OCR (Tesseract.js client-side).
- `components/rh/empleado-alta-wizard.tsx` — file uploads multi-tipo durante el alta.
- `app/rdb/cortes/actions.ts` — server actions con uploads.
- Helper existente `lib/adjuntos.ts` — read flows (signed URLs, proxy `/api/adjuntos/[...path]`).

Patrones detectados (consistentes):

- ✅ **Bucket único `adjuntos`** privado.
- ✅ **Tabla `erp.adjuntos`** con `entidad_tipo` + `entidad_id` + `rol` + `url`.
- ✅ **Read via proxy** `/api/adjuntos/<path>` (cookie auth) o signed URLs (cuando se necesitan compartibles).
- ✅ **Helper `lib/adjuntos.ts`** con `getAdjuntoProxyUrl()` y `getAdjuntoSignedUrl()`.

Patrones inconsistentes:

- ⚠️ **Path construction**: cada uploader arma el path a mano (`${empresa}/${entidad}/${id}/${filename}`, a veces con timestamp prefix, a veces no). Filenames no se sluggifican consistentemente.
- ⚠️ **UI de upload**: drag-drop en algunos, click-only en otros. Progress visible inconsistente.
- ⚠️ **Delete confirm**: algunos usan `<ConfirmDialog>` de ADR-008, otros `window.confirm()` legacy.
- ⚠️ **Preview**: PDFs algunos usan `<embed>`, otros redirigen al proxy URL. Imágenes usan `<img>` con signed URL.

ADR-016 (forms-pattern) explícitamente puso "file inputs como parte del form schema" fuera de alcance — esta iniciativa lo cubre.

## Decisión

Sprint 1 codifica las **convenciones existentes** (paths, buckets, tabla `erp.adjuntos`, helpers de read) en ADR + helper `buildAdjuntoPath()`. Sprint 2+ extrae el componente `<FileAttachments>` (drag-drop + preview + delete) como golden migration.

### Las 6 reglas (FA1–FA6)

#### FA1 — Bucket único `adjuntos` privado; reads via proxy `/api/adjuntos/<path>`

Toda la storage del repo vive en el bucket `adjuntos` (privado). Reads van por:

1. **Proxy `/api/adjuntos/<path>`** (default) — cookie-authenticated, sin signed URLs efímeros. Funciona para `<img src=...>` y `<a href=...>` directo.
2. **Signed URLs** (`getAdjuntoSignedUrl()`) — solo cuando el URL debe vivir fuera del cookie auth (e.g. compartir un PDF temporalmente).

Otros buckets (`branding` para logos públicos por empresa) son excepciones documentadas; no se mezclan con adjuntos del usuario.

> **Por qué**: cookie auth + proxy elimina los issues de signed URL expiry mid-render. El proxy es el path canónico hoy y se mantiene.

#### FA2 — Path canónico `<empresa>/<entidad>/<entidadId>/<timestamp>-<slug>.<ext>`

`buildAdjuntoPath()` (en `lib/storage/path.ts`) construye el path:

```ts
buildAdjuntoPath({
  empresa: 'dilesa',
  entidad: 'documentos',
  entidadId: doc.id,
  filename: file.name,
});
// → 'dilesa/documentos/abc-123.../1714426212-contrato.pdf'
```

- **`empresa`** — slug de la empresa dueña (`dilesa`, `rdb`, `ansa`, `coagan`).
- **`entidad`** — tabla/feature (`documentos`, `empleados`, `vouchers`, `levantamientos`, `movimientos`, `personas`, etc.).
- **`entidadId`** — UUID o human-id de la fila padre.
- **`timestamp-slug.ext`** — milliseconds prefix evita colisiones con archivos del mismo nombre; slug normaliza a ASCII + lowercase + dashes.

> **Por qué**: el patrón ya emergió pero cada uploader lo escribe a mano y los filenames varían (`Contrato.pdf`, `contrato (1).pdf`, etc.). Slugificación consistente evita issues con CDN cache + storage URL encoding.

#### FA3 — Tabla `erp.adjuntos` como single source of truth de metadata

Cada upload inserta en `erp.adjuntos` con:

```sql
INSERT INTO erp.adjuntos (
  empresa_id, entidad_tipo, entidad_id, rol, url,
  nombre, tipo_mime, tamano_bytes, created_at
) VALUES (...);
```

`url` guarda **solo el path** (no full URL, no signed). El read flow lo wrappea con `getAdjuntoProxyUrl(row.url)` o `getAdjuntoSignedUrl(supabase, row.url)`.

> **Por qué**: el path es estable; URLs cambian (signed expira, public flag toggle, host migration). Persistir solo el path desacopla la persistencia del read flow.

#### FA4 — Roles canónicos por entidad

Cada entidad define sus `rol` permitidos (en TypeScript types o en la app):

- **Documentos** — `documento_principal` | `imagen_referencia` | `anexo`.
- **Empleados** — `foto` | `ine_frente` | `ine_reverso` | `curp` | `acta_nacimiento` | `comprobante_domicilio` | `csf` | `nss` | `otros`.
- **Vouchers** — `voucher_tarjeta` | `comprobante_movimiento` | `otro`.
- **Empresas** — `csf` | `acta_constitutiva` | `poder_general` | etc.

Si el caller necesita un rol nuevo, lo agrega al type/enum del módulo + a la convención visual (categorías agrupadas en la UI).

> **Por qué**: roles tipados permiten agrupar los archivos por sección en la UI ("Identidad" / "Soporte legal" / etc.) y filtrar en queries (`WHERE rol = 'csf'`).

#### FA5 — Delete via `<ConfirmDialog>` (ADR-008); soft o hard según entidad

`window.confirm()` está prohibido (ADR-008 T2). Cualquier delete de adjunto pasa por `<ConfirmDialog>` con copy explícito + `confirmVariant="destructive"`.

Hard delete (storage + DB) para entidades efímeras (vouchers temporales). Soft delete (DB row + storage object remove) para entidades con histórico (documentos legales — ojo, el path queda libre para sobreescritura; en archivos críticos preferir mantener histórico via versioning futuro).

> **Por qué**: archivos pueden ser legalmente relevantes (contratos, escrituras, CSF). Confirmación explícita + copy descriptivo previene clicks accidentales.

#### FA6 — Read flows usan `lib/adjuntos.ts` (no construir URLs ad-hoc)

Cualquier render de adjunto pasa por:

```ts
import { getAdjuntoProxyUrl, getAdjuntoSignedUrl } from '@/lib/adjuntos';
```

`getAdjuntoProxyUrl(row.url)` — para `<img>` / `<a>` inline.
`getAdjuntoSignedUrl(supabase, row.url, 3600)` — para compartir/email/external.

`getAdjuntoPath()` normaliza inputs (paths bare, legacy public URLs, signed URLs, proxy URLs) → siempre extrae el path canónico. Útil para migraciones / scripts.

> **Por qué**: este helper ya está consolidado y maneja edge cases (legacy URLs, normalización). Centralizarlo evita que cada caller redescubra los markers de URL.

## Implementación

- **Sprint 1** (este PR): foundation policy — `lib/storage/path.ts` con `buildAdjuntoPath()` + `slugifyFilename()` + tests. ADR-022 codifica las 6 reglas. Sin migración masiva — los uploaders existentes siguen como están.
- **Sprint 2+** (postponed): extraer `<FileAttachments>` componente con drag-drop + preview + delete. Adoptar `buildAdjuntoPath()` en uploaders existentes.

## Consecuencias

### Positivas

- **Path construction consistente**: `buildAdjuntoPath()` reemplaza la concatenación manual.
- **Filenames sluggificados** evitan issues con CDN/encoding.
- **Convención documentada** para entidades y roles nuevos — el dev no inventa la suya.
- **Code review explícito**: ¿usa `buildAdjuntoPath()`? ¿inserta en `erp.adjuntos`? ¿lee via `lib/adjuntos.ts`?

### Negativas

- **Sin componente `<FileAttachments>` en v1**. Los uploaders existentes siguen como están (consistentes en convenciones pero distintos en UI). Sprint 2 lo extrae.
- **Roles por entidad** son convención (no enforcement). Si un dev mete `rol: 'foo'` random, el linter no lo detecta. Code review.

### Cosas que NO cambian

- `lib/adjuntos.ts` (read helpers) — sigue siendo el punto de entrada para read.
- Bucket `adjuntos` y RLS policies — sin cambios.
- `erp.adjuntos` schema — sin cambios.
- Proxy `/api/adjuntos/[...path]` — sin cambios.

## Fuera de alcance v1

- **Componente `<FileAttachments>`** con drag-drop / preview / delete UI — Sprint 2.
- **Versioning de archivos** (subir nueva versión, mantener histórico).
- **OCR / extracción** — vive en cada caller (cortes vouchers, proveedores CSF, documentos legales). Esta iniciativa solo cubre upload/storage.
- **Mobile camera capture** — patrón ya en levantamientos físicos; revisar coordinación con `responsive-policy`.
- **Server actions para signed URL** — los callers existentes funcionan con cliente directo; no se cambia.

## Referencias

- Helper: [lib/storage/path.ts](../../lib/storage/path.ts)
- Read helper: [lib/adjuntos.ts](../../lib/adjuntos.ts)
- Iniciativa: [docs/planning/file-attachments.md](../planning/file-attachments.md)
- ADR-008 — `<ConfirmDialog>` (FA5 referencia).
- ADR-016 — forms-pattern (file inputs marked out-of-scope).
