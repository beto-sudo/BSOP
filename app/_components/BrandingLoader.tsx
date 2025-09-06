// app/_components/BrandingLoader.tsx
// Server Component SIN dependencias de Supabase helpers.
// Sólo detecta si hay empresa seleccionada (cookie) y deja
// que el cliente aplique el branding por defecto (BSOP).

import { cookies } from "next/headers";
import BrandingClient from "./BrandingClient";

const COMPANY_COOKIE_KEY = "CURRENT_COMPANY_ID";

export default async function BrandingLoader() {
  const c = await cookies();
  const companyId = c.get(COMPANY_COOKIE_KEY)?.value ?? null;

  // No resolvemos tema/colores aquí para evitar dependencias.
  // BrandingClient ya aplica el tema BSOP por defecto.
  // Si en el futuro quieres, puedes pasar companyId hacia el cliente
  // para que éste consulte un endpoint propio y derive el tema.
  return <BrandingClient theme={null} companyName={null} />;
}
