
-- Add tipo column for normal vs sin_corte
ALTER TABLE caja.cortes ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'normal';

-- Add unique constraint on coda_id for upsert support (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cortes_coda_id_unique' AND conrelid = 'caja.cortes'::regclass
  ) THEN
    ALTER TABLE caja.cortes ADD CONSTRAINT cortes_coda_id_unique UNIQUE (coda_id);
  END IF;
END $$;

-- Add efectivo_contado column if missing
ALTER TABLE caja.cortes ADD COLUMN IF NOT EXISTS efectivo_contado numeric;

-- Add turno and observaciones if missing
ALTER TABLE caja.cortes ADD COLUMN IF NOT EXISTS turno text;
ALTER TABLE caja.cortes ADD COLUMN IF NOT EXISTS observaciones text;
;
