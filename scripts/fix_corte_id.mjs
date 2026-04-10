import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = 'https://ybklderteyhuugzfmxbi.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlia2xkZXJ0ZXlodXVnemZteGJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njc4ODEzMywiZXhwIjoyMDcyMzY0MTMzfQ.ZUMZVuuGl7Eva5AB0jUqT7DqdlVfT0b8odXfPNl-e24';
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
