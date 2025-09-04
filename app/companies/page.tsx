// app/companies/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import CompaniesClient from "./ui";

export const revalidate = 0;

export default async function CompaniesPage() {
  const supabase = supabaseServer();

  // Autenticación
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/signin?redirect=/companies");

  // Memberships del usuario
  const { data: memberships, error: mErr } = await supabase
    .from("company_member")
    .select("company_id")
    .eq("user_id", user.id);

  if (mErr) {
    // Sin compañías o error: muestra vacío
    return <CompaniesClient companies={[]} />;
  }

  const ids = (memberships ?? []).map((m) => m.company_id);
  if (ids.length === 0) return <CompaniesClient companies={[]} />;

  // Datos de las compañías
  const { data: companies, error: cErr } = await supabase
    .from("Company")
    .select("id,name,slug,settings")
    .in("id", ids)
    .order("name", { ascending: true });

  if (cErr) return <CompaniesClient companies={[]} />;

  const mapped = (companies ?? []).map((c: any) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    logoUrl: c.settings?.branding?.logoUrl ?? "",
    slogan: c.settings?.branding?.slogan ?? "",
  }));

  return <CompaniesClient companies={mapped} />;
}
