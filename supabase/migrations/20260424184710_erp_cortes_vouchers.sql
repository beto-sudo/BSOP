-- ════════════════════════════════════════════════════════════════════════════
-- erp.cortes_vouchers — fotos de cierres de lote de terminales bancarias
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cuando RDB cierra el corte con ingresos_tarjeta > 0, las 2 terminales BBVA
-- (afiliaciones 004717713 y 004717714) imprimen un ticket "REPORTE DE CIERRE
-- LOTE". Hoy se pierden físicamente. Este feature exige foto del ticket
-- adjunta al corte para auditoría (múltiples vouchers por corte).
--
-- MVP alcance RDB; diseñado para extenderse a otras empresas (ANSA, etc)
-- amplíando la policy de INSERT.
--
-- afiliacion / monto_reportado quedan nullable para soportar OCR o captura
-- manual en un sprint posterior; el MVP sólo guarda la foto.
--
-- Infra: bucket privado `cortes-vouchers`, signed URLs en app.
-- UI en PR siguiente.

BEGIN;

-- ═══════════════════════════ FASE 0 — INVENTORY ═══════════════════════════
DO $$
DECLARE
  n_cortes_tarjeta int;
BEGIN
  SELECT count(*) INTO n_cortes_tarjeta
  FROM rdb.v_cortes_lista
  WHERE ingresos_tarjeta > 0
    AND fecha_operativa >= CURRENT_DATE - 30;
  RAISE NOTICE 'FASE 0 — cortes RDB con ingresos_tarjeta>0 últimos 30 días: %', n_cortes_tarjeta;
END $$;

-- ═══════════════════════════ FASE 1 — SCHEMA ══════════════════════════════

CREATE TABLE erp.cortes_vouchers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES core.empresas(id),
  corte_id        uuid NOT NULL REFERENCES erp.cortes_caja(id) ON DELETE CASCADE,

  storage_path    text NOT NULL UNIQUE,
  nombre_original text,
  tamano_bytes    integer CHECK (tamano_bytes IS NULL OR tamano_bytes > 0),
  mime_type       text CHECK (mime_type IN (
    'image/jpeg','image/png','image/webp','image/heic','image/heif'
  )),

  -- OCR / captura manual futura; nullable en MVP
  afiliacion       text,
  monto_reportado  numeric,

  uploaded_by          uuid REFERENCES core.usuarios(id),
  uploaded_by_nombre   text,            -- snapshot para audit ante cambios de usuario
  uploaded_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cortes_vouchers_corte_id_idx   ON erp.cortes_vouchers (corte_id);
CREATE INDEX cortes_vouchers_empresa_id_idx ON erp.cortes_vouchers (empresa_id);

COMMENT ON TABLE  erp.cortes_vouchers IS
  'Fotos de cierres de lote de terminales bancarias por corte. Feature 2026-04-24. MVP RDB; extensible.';
COMMENT ON COLUMN erp.cortes_vouchers.storage_path IS
  'Path en bucket cortes-vouchers. Formato: {empresa_slug}/{corte_id}/{uuid}.{ext}';
COMMENT ON COLUMN erp.cortes_vouchers.uploaded_by_nombre IS
  'Snapshot del nombre del usuario al subir — preserva audit trail si el registro de core.usuarios cambia después.';

-- Bucket de storage: privado, 10MB max, sólo imágenes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cortes-vouchers',
  'cortes-vouchers',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── RLS — tabla erp.cortes_vouchers ──
-- Modelo: mismo grain que erp.cortes_caja (empresa-level via fn_has_empresa).
-- Granularidad por módulo (rdb.cortes acceso_lectura/escritura) vive en la
-- capa app (lib/permissions.ts). Cuando exista helper SQL por módulo, se
-- refina aquí sin cambiar el contrato de la tabla.
ALTER TABLE erp.cortes_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_cortes_vouchers_select ON erp.cortes_vouchers
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- MVP: sólo RDB puede insertar. Cuando otras empresas adopten el feature,
-- se amplía la lista (o se quita el filtro por empresa_id y se confía en
-- fn_has_empresa).
CREATE POLICY erp_cortes_vouchers_insert ON erp.cortes_vouchers
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid  -- RDB
    AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
    AND uploaded_by = core.fn_current_user_id()
  );

-- DELETE: sólo quien subió, o admin.
CREATE POLICY erp_cortes_vouchers_delete ON erp.cortes_vouchers
  FOR DELETE TO authenticated
  USING (
    uploaded_by = core.fn_current_user_id()
    OR core.fn_is_admin()
  );

-- Sin policy de UPDATE: los vouchers son inmutables (audit trail). Si se
-- necesita corregir metadata (afiliacion/monto_reportado), se implementa en
-- un sprint posterior con policy específica.

-- ── RLS — storage.objects para bucket cortes-vouchers ──
-- owner se alimenta del auth.users.id que sube el objeto (lo setea Storage
-- automáticamente), no de core.usuarios.id. Se mantiene auth.uid() aquí.
CREATE POLICY cortes_vouchers_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cortes-vouchers');

CREATE POLICY cortes_vouchers_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cortes-vouchers' AND owner = auth.uid());

CREATE POLICY cortes_vouchers_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cortes-vouchers' AND owner = auth.uid());

-- ═══════════════════════════ FASE 2 — VERIFY ══════════════════════════════
DO $$
DECLARE
  n_cols        int;
  n_idx         int;
  bucket_existe boolean;
  n_policies    int;
BEGIN
  SELECT count(*) INTO n_cols
    FROM information_schema.columns
   WHERE table_schema = 'erp' AND table_name = 'cortes_vouchers';

  SELECT count(*) INTO n_idx
    FROM pg_indexes
   WHERE schemaname = 'erp' AND tablename = 'cortes_vouchers';

  SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'cortes-vouchers')
    INTO bucket_existe;

  SELECT count(*) INTO n_policies
    FROM pg_policies
   WHERE (schemaname = 'erp'     AND tablename = 'cortes_vouchers')
      OR (schemaname = 'storage' AND policyname LIKE 'cortes_vouchers_storage_%');

  IF n_cols < 11 THEN
    RAISE EXCEPTION 'FASE 2 FAIL — columnas esperadas >=11, actuales %', n_cols;
  END IF;
  IF n_idx < 3 THEN
    RAISE EXCEPTION 'FASE 2 FAIL — indexes esperados >=3, actuales %', n_idx;
  END IF;
  IF NOT bucket_existe THEN
    RAISE EXCEPTION 'FASE 2 FAIL — bucket cortes-vouchers no existe';
  END IF;
  IF n_policies < 6 THEN
    RAISE EXCEPTION 'FASE 2 FAIL — policies esperadas >=6 (3 tabla + 3 storage), actuales %', n_policies;
  END IF;

  RAISE NOTICE 'FASE 2 OK — % cols, % idx, bucket OK, % policies.', n_cols, n_idx, n_policies;
END $$;

COMMIT;
