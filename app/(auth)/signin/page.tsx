'use client';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function SignInPage() {
  const supabase = createClientComponentClient();

  async function handleSignIn() {
    // “next” viene del query ?redirect=/ruta (opcional)
    const params = new URLSearchParams(window.location.search);
    const next = params.get('redirect') || '/';
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?redirect=${encodeURIComponent(next)}`;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
  }

  return (
    <button onClick={handleSignIn} className="btn btn-primary">
      Continuar con Google
    </button>
  );
}
