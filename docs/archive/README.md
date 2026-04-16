# Archive

Material histórico retirado del código activo pero conservado por valor de referencia.

## Contenido

### `reports/`
Reportes operativos de fixes y validaciones ejecutados en 2026-04-08/09. Utilidad: contexto histórico de qué se arregló y por qué. No son documentación viva.

### `prompts/`
Prompts usados durante el desarrollo inicial (órdenes de compra, requisiciones, caja). Referencia histórica; no reflejan el estado actual del código.

### `scripts/`
Scripts one-off ya ejecutados (backfills, correcciones puntuales de datos, debugging queries). No forman parte del pipeline activo.

**IMPORTANTE**: los scripts en esta carpeta tuvieron credenciales hardcodeadas que fueron redactadas. Las keys comprometidas siguen en el historial de git hasta que se ejecute un `git filter-repo` — rotar antes de suponer que ya no son válidas:
- `backfill_manual_2026-04-08.js` — Supabase service role key + Coda API key
- `fix_corte_id.mjs` — Supabase service role key

Si necesitas volver a ejecutar alguno, provee las credenciales vía `process.env.*` desde `.env.local`. Nunca hardcodees.
