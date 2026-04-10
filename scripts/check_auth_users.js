import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/Beto/BSOP/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error(error);
    return;
  }
  console.dir(data.users.map((u) => ({
    id: u.id,
    email: u.email,
    user_metadata: u.user_metadata,
    app_metadata: u.app_metadata,
  })), { depth: null });
}
check();