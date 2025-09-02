const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    // IMPORTANTÍSIMO: que apunte a TU dominio y que esté permitido en Supabase URL Configuration
    redirectTo: `${appUrl}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
    queryParams: { prompt: "select_account" },
    skipBrowserRedirect: false,
  },
});
