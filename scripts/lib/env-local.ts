import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Carga `.env.local` desde `process.cwd()` para que los generadores funcionen
 * con `npm run schema:ref` / `functions:ref` sin exportar SUPABASE_DB_URL a
 * mano. Solo define variables que no estén ya en el entorno (el entorno real
 * gana — importante para CI, donde la var viene del GitHub secret).
 */
export function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
