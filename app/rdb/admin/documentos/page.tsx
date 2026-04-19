'use client';

import { RequireAccess } from '@/components/require-access';
import { DocumentosModule } from '@/components/documentos/documentos-module';

const EMPRESA_ID = '41c0b58f-5483-439b-aaa6-17b9d995697f';

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
