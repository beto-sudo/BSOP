import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { ContentShell } from '@/components/ui/content-shell';
import { DesktopOnlyNotice } from '@/components/responsive';
import { getServiciosData } from '@/lib/sanren-servicios';
import { ServiciosView } from '@/components/sanren/servicios-view';

// Datos personales leídos server-side con service-role (RLS deny-all) — siempre
// frescos, igual que /peptides. Sin esto, un recibo nuevo no se vería al volver.
export const dynamic = 'force-dynamic';

/**
 * SANREN → Servicios: control de recibos de servicios de la casa
 * (iniciativa sanren-servicios). Lectura server-side; filtrado client-side.
 *
 * @module Servicios
 * @responsive desktop-only
 */
export default async function ServiciosPage() {
  const data = await getServiciosData();

  return (
    <RequireAccess empresa="sanren">
      <ContentShell>
        <DesktopOnlyNotice module="Servicios" />
        <div className="hidden sm:block">
          <Suspense>
            <ServiciosView data={data} />
          </Suspense>
        </div>
      </ContentShell>
    </RequireAccess>
  );
}
