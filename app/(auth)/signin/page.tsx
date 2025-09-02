// app/(auth)/signin/page.tsx (tu botón)
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${appUrl}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
    queryParams: { prompt: "select_account" },
    skipBrowserRedirect: false,
  },
});
