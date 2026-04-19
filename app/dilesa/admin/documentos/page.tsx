'use client';

import { RequireAccess } from '@/components/require-access';
import { DocumentosModule } from '@/components/documentos/documentos-module';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

export default function DilesaDocumentosPage() {
  return (
    <RequireAccess empresa="dilesa">
      <DocumentosModule empresaId={EMPRESA_ID} empresaSlug="dilesa" title="Documentos — DILESA" />
    </RequireAccess>
  );
}
