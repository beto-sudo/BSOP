/**
 * Modelos por defecto de la capa de IA (iniciativa `registro-ia`).
 *
 * Fuente ÚNICA de la verdad del modelo de cada modalidad. Antes vivían
 * hardcodeados en 6 archivos (`MODELO_CLAUDE` en extraction-core + literales
 * sueltos); si Anthropic deprecaba un modelo había que cazarlos uno por uno.
 * Ahora cambiar el default = 1 línea aquí.
 *
 * El override por uso (editable desde la UI sin redeploy) llega en el Sprint 2
 * vía `core.ai_config`; `resolveModel()` ya lo contempla como seam.
 */

/** Modelo Claude para extracción con visión (documentos, CSF, planos, PLD…). */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8';

/** Modelo de embeddings (búsqueda semántica de documentos). */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';

/**
 * Dimensiones del embedding. AMARRADO a la columna `erp.documentos`
 * `contenido_embedding vector(1536)`: cambiarlo exige reindexar todo. No tocar
 * sin un plan de re-embedding.
 */
export const EMBEDDING_DIMS = 1536;
