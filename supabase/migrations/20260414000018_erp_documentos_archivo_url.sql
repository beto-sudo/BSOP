-- Add archivo_url column to erp.documentos
ALTER TABLE erp.documentos ADD COLUMN IF NOT EXISTS archivo_url text;

-- Grant access
GRANT SELECT ON erp.documentos TO anon, authenticated;
