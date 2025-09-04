// app/(app)/settings/admin/page.tsx
import { supabaseServer } from "@/lib/supabaseServer";
import { isSuperadminEmail } from "@/lib/superadmin";
import { redirect } from "next/navigation";
import AdminHome from "./ui";

export const revalidate = 0;

export default async function Page() {
  const supa = supabaseServer();
  const { data: auth } = await supa.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/signin?redirect=/settings/admin");
  if (!isSuperadminEmail(user.email)) redirect("/");

  return <AdminHome />;
}
