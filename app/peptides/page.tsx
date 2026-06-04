import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { ContentShell } from '@/components/ui/content-shell';
import { DesktopOnlyNotice } from '@/components/responsive';
import { getPeptidesData } from '@/lib/peptides';
import { PeptidesView } from '@/components/peptides/peptides-view';

/**
 * Base de info de sourcing de péptidos (iniciativa sanren-peptides).
 * SANREN → Péptidos. Lectura server-side con service-role (RLS deny-all);
 * el filtrado es client-side. La bitácora vive en Health (decisión D2).
 *
 * @module Peptides
 * @responsive desktop-only
 */
export default async function PeptidesPage() {
  const data = await getPeptidesData();

  return (
    <RequireAccess empresa="sanren">
      <ContentShell>
        <DesktopOnlyNotice module="Péptidos" />
        <div className="hidden sm:block">
          <Suspense>
            <PeptidesView data={data} />
          </Suspense>
        </div>
      </ContentShell>
    </RequireAccess>
  );
}
