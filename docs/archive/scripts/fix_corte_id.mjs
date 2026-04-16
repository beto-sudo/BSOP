import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// ARCHIVED — one-off de limpieza. URL + service_role key originales fueron
// REDACTADAS por estar hardcodeadas (ver PR de archivado). Rota la key antes
// de volver a correr este script y lee del entorno.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url || !key) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.');
const supabase = createClient(url, key, { auth: { persistSession: false }, db: { schema: 'rdb' } });

async function run() {
  const { data: openCorte, error: e1 } = await supabase.from('cortes').select('id, corte_nombre, hora_inicio, hora_fin').eq('estado', 'abierto').single();
  console.log('Open corte:', openCorte, e1?.message);

  if (openCorte) {
    const { data: updated, error: e2 } = await supabase.from('waitry_pedidos')
      .update({ corte_id: openCorte.id })
      .is('corte_id', null)
      .gte('timestamp', openCorte.hora_inicio)
      .select('id, order_id, total_amount');
    
    console.log('Updated:', updated, e2?.message);
  }
}
run();
