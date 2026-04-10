const fs = require('fs');

const envFile = fs.readFileSync('/Users/Beto/BSOP/.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) env[key] = vals.join('=').trim();
});

const url = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/v_cortes_completo?corte_nombre=eq.Corte-398&select=*';
const options = {
  method: 'GET',
  headers: {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Accept-Profile': 'caja'
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(data => console.log("v_cortes_completo:", JSON.stringify(data, null, 2)))
  .catch(err => console.error(err));

const url2 = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/ventas?corte_id=eq.398&select=order_id';
const options2 = {
  method: 'GET',
  headers: {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Accept-Profile': 'waitry'
  }
};

fetch(url2, options2)
  .then(res => res.json())
  .then(data => {
      const distinctOrders = new Set(data.map(o => o.order_id));
      console.log(`Total rows in waitry.ventas for corte 398: ${data.length}`);
      console.log(`Distinct order_ids: ${distinctOrders.size}`);
  })
  .catch(err => console.error(err));
