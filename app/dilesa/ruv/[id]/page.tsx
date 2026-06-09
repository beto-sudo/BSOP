'use client';

import { useParams } from 'next/navigation';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { RuvFrenteDetalle } from '@/components/dilesa/ruv-frente-detalle';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module RUV — Detalle de frente (DILESA)
 * @responsive desktop-only
 *
 * Página completa del frente (oferta) RUV: datos de la oferta + KPIs + los
 * lotes del frente con los hitos del trámite (DTU / extracción / seguro de
 * calidad / paquete RUV) editables por lote + checklist de documentos.
 * Iniciativa `dilesa-ruv` v1.1. Gate `dilesa.ruv`.
 */
export default function Page() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? '') : '';
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ruv">
      <DesktopOnlyNotice module="RUV — Frente" />
      <div className="hidden sm:block">
        {id ? <RuvFrenteDetalle frenteId={id} empresaId={DILESA_EMPRESA_ID} /> : null}
      </div>
    </RequireAccess>
  );
}
