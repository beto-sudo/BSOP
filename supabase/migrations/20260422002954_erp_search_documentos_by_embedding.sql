-- RPC para búsqueda semántica de documentos.
--
-- Recibe un embedding (1536 dims, generado por OpenAI text-embedding-3-large
-- truncado a 1536 vía Matryoshka) y devuelve los documentos más similares
-- ordenados por distancia coseno descendente.
--
-- Respeta RLS: `SECURITY INVOKER` + el helper usual de empresa implícito
-- vía el filtro por `empresa_id = ANY(...)` contrastado con las empresas
-- a las que el caller tiene acceso por RLS en erp.documentos.

CREATE OR REPLACE FUNCTION erp.search_documentos_by_embedding(
  query_embedding extensions.vector(1536),
  p_empresa_ids uuid[],
  top_k int DEFAULT 20
) RETURNS TABLE (
  id uuid,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT d.id, (1 - (d.contenido_embedding <=> query_embedding))::real AS similarity
  FROM erp.documentos d
  WHERE d.empresa_id = ANY(p_empresa_ids)
    AND d.contenido_embedding IS NOT NULL
    AND d.deleted_at IS NULL
  ORDER BY d.contenido_embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(top_k, 50));
$$;

COMMENT ON FUNCTION erp.search_documentos_by_embedding IS
  'Búsqueda semántica en erp.documentos. Recibe vector 1536 y devuelve '
  'top_k documentos ordenados por distancia coseno (más similares primero). '
  'Respeta RLS de erp.documentos del caller.';

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
