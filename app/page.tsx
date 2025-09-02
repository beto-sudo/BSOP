'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');

      // Si venimos de Google con ?code=..., completamos PKCE aquí mismo.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          console.error(error.message);
          router.replace('/signin?error=' + encodeURIComponent(error.message));
          return;
        }
        // Limpia la URL y regresa donde nos pidieron
        const back = url.searchParams.get('redirect') || '/';
        window.history.replaceState({}, '', back);
      }

      setReady(true);
    })();
  }, [router]);

  if (!ready) return null; // o un loader

  // Aquí puedes seguir con tu lógica: leer sesión, etc.
  return <div>App</div>;
}
