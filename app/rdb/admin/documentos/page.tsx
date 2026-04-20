'use client';

import { RequireAccess } from '@/components/require-access';
import { DocumentosModule } from '@/components/documentos/documentos-module';

const EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

export default function RdbAdminDocumentosPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.admin.documentos">
      <DocumentosModule
        empresaId={EMPRESA_ID}
        empresaSlug="rdb"
        title="Documentos — Rincón del Bosque"
      />
    </RequireAccess>
  );
}
