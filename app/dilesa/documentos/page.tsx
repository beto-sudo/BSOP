'use client';

import { RequireAccess } from '@/components/require-access';
import { Construction } from 'lucide-react';

export default function DilesaDocumentosPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.documentos">
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <Construction className="h-12 w-12 text-[var(--text)]/30" />
        <h1 className="mt-4 text-2xl font-semibold text-[var(--text)]">Documentos — DILESA</h1>
        <p className="mt-2 text-sm text-[var(--text)]/55">Este módulo está en construcción.</p>
      </div>
    </RequireAccess>
  );
}
