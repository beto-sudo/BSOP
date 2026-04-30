'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DocumentosModule } from '@/components/documentos/documentos-module';

/**
 * @module Documentos (cross-empresa)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess>
      <DesktopOnlyNotice module="Documentos" />
      <div className="hidden sm:block">
        <DocumentosModule scope="user-empresas" empresaSlug="" title="Documentos" />
      </div>
    </RequireAccess>
  );
}
