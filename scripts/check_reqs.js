import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/Beto/BSOP/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase
    .schema('rdb')
    .from('requisiciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) console.error(error);
  console.dir(data, { depth: null });
}
check();
