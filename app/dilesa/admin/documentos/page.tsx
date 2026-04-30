'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DocumentosModule } from '@/components/documentos/documentos-module';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

/**
 * @module Documentos (DILESA)
 * @responsive desktop-only
 */
export default function DilesaDocumentosPage() {
  return (
    <RequireAccess empresa="dilesa">
      <DesktopOnlyNotice module="Documentos" />
      <div className="hidden sm:block">
        <DocumentosModule empresaId={EMPRESA_ID} empresaSlug="dilesa" title="Documentos — DILESA" />
      </div>
    </RequireAccess>
  );
}
