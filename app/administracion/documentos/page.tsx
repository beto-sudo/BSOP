'use client';

import { RequireAccess } from '@/components/require-access';
import { DocumentosModule } from '@/components/documentos/documentos-module';

export default function Page() {
  return (
    <RequireAccess>
      <DocumentosModule scope="user-empresas" empresaSlug="" title="Documentos" />
    </RequireAccess>
  );
}
