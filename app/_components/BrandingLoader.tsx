// app/_components/BrandingLoader.tsx
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentCompanyIdFromCookies } from "@/lib/company";
import BrandingClient from "./BrandingClient";
import type { Database } from "@/types/supabase";

export default async function BrandingLoader() {
  const companyId = await getCurrentCompanyIdFromCookies();

  if (!companyId) {
    // sin empresa => tema BSOP por defecto
    return <BrandingClient theme={null} companyName={null} />;
  }

  const supabase = createServerClient<Database>();
  const { data: company } = await supabase
    .from("Company")
    .select("id, name, settings")
    .eq("id", companyId)
    .maybeSingle();

  const theme = (company?.settings as any)?.theme ?? null;
  const name = company?.name ?? null;

  return <BrandingClient theme={theme} companyName={name} />;
}
