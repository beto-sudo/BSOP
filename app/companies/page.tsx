// app/companies/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import CompaniesClient from "./ui";

export const revalidate = 0;

export default async function CompaniesPage() {
  const supabase = supabaseServer();

  // 1) Auth
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/signin?redirect=/companies");

  // 2) Resuelve profile.id (puede no ser igual a auth.user.id)
  let profileId: string | null = null;
  let whyEmpty = "";

  // a) intenta por id
  const { data: pById, error: pByIdErr } = await supabase
    .from("profile")
    .select("id,email")
    .eq("id", user.id)
    .maybeSingle();

  if (pById) {
    profileId = pById.id;
  } else {
    // b) intenta por email (algunas instalaciones poblan profile con otro id)
    const { data: pByEmail, error: pByEmailErr } = await supabase
      .from("profile")
      .select("id,email")
      .eq("email", user.email ?? "")
      .maybeSingle();

    if (pByEmail) {
      profileId = pByEmail.id;
    } else {
      whyEmpty = "No se encontró tu perfil en la tabla 'profile'.";
    }
  }

  // 3) Si hay profileId, busca memberships
  let companies: Array<{ id: string; name: string; slug: string; logoUrl?: string; slogan?: string }> = [];

  if (profileId) {
    const { data: memberships, error: mErr } = await supabase
      .from("company_member")
      .select("company_id")
      .eq("user_id", profileId);

    if (mErr) {
      whyEmpty = `No fue posible leer tus empresas (${mErr.message}).`;
    } else {
      const ids = (memberships ?? []).map((m: any) => m.company_id);
      if (ids.length === 0) {
        whyEmpty =
          "No tienes compañías asignadas. Pide a un administrador que te agregue o crea una nueva compañía.";
      } else {
        const { data: rows, error: cErr } = await supabase
          .from("Company")
          .select("id,name,slug,settings")
          .in("id", ids)
          .order("name", { ascending: true });

        if (cErr) {
          whyEmpty = `No se pudieron cargar las compañías (${cErr.message}).`;
        } else {
          companies = (rows ?? []).map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            logoUrl: c.settings?.branding?.logoUrl ?? "",
            slogan: c.settings?.branding?.slogan ?? "",
          }));
        }
      }
    }
  }

  return <CompaniesClient companies={companies} emptyMessage={whyEmpty} />;
}
