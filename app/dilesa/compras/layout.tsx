import { type ReactNode } from 'react';
import { RoutedModuleTabs } from '@/components/module-page';
import { TeTocaStrip } from '@/components/gasto/te-toca-strip';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * Layout compartido del hub Compras (DILESA) — ciclo P2P constructora-first.
 *
 * Patrón "module with submodules / routed tabs" (ADR-005) + sub-slugs por tab
 * (ADR-030). Iniciativa `dilesa-compras` · Sprint 2.
 *
 *   /dilesa/compras                → tab "Órdenes" (default landing).
 *   /dilesa/compras/requisiciones  → tab "Requisiciones".
 *   /dilesa/compras/recepciones    → tab "Recepciones".
 *
 * El ciclo se ancla al presupuesto por partidas (D7/D12): cada línea va a un
 * concepto + partida de `erp.presupuesto_partidas`, la OC al enviarse mueve
 * `comprometido` y la recepción devenga `ejercido` en `erp.v_partida_control`,
 * sin tocar inventario. Las RPCs de OC (`oc_cerrar_orden`,
 * `oc_cancelar_pendiente_linea`, `fn_oc_recalcular_estado`) se reusan de `erp`;
 * la recepción usa una variante sin inventario (`oc_recibir_linea_partida`).
 *
 * Cada `module` es un sub-slug que `<RoutedModuleTabs>` filtra por permiso;
 * los gates de acceso viven en cada sub-page (ADR-030 SS5), no en el layout.
 */
// Tabs en el orden del flujo P2P (iniciativa `dilesa-flujo-gasto` S3):
// Solicitar → Cotizar → Ordenar → Recibir. Las URLs NO cambian (no-goal D8);
// el index `/dilesa/compras` sigue siendo Órdenes, solo se reordena el strip.
const TABS = [
  {
    label: 'Requisiciones',
    href: '/dilesa/compras/requisiciones',
    module: 'dilesa.compras.requisiciones',
  },
  {
    label: 'Cotizaciones',
    href: '/dilesa/compras/cotizaciones',
    module: 'dilesa.compras.cotizaciones',
  },
  {
    label: 'Órdenes',
    href: '/dilesa/compras',
    exact: true,
    module: 'dilesa.compras.ordenes',
  },
  {
    label: 'Recepciones',
    href: '/dilesa/compras/recepciones',
    module: 'dilesa.compras.recepciones',
  },
] as const;

export default function ComprasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="space-y-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <TeTocaStrip empresaId={DILESA_EMPRESA_ID} empresa="dilesa" />
        <RoutedModuleTabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
