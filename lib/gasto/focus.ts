/**
 * consumeFocusParam — lectura one-shot del query param `?focus=<id>` para
 * drill-down entre módulos del ciclo de gasto (iniciativa `dilesa-flujo-gasto`).
 *
 * Los links del hilo (`hrefDoc`) llegan con `?focus=`; el módulo destino lo
 * consume al montar, abre el documento y limpia la URL (replaceState, sin
 * entrada extra en el historial).
 *
 * Deliberadamente NO usa `useSearchParams`: es una lectura única de drill-down
 * (no un filtro bidireccional ADR-007), y así los pages client de los hubs no
 * necesitan el wrapper Suspense del bailout de Next 16
 * (`missing-suspense-with-csr-bailout`, ver ADR-030).
 */
export function consumeFocusParam(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const focus = url.searchParams.get('focus');
  if (!focus) return null;
  url.searchParams.delete('focus');
  window.history.replaceState(null, '', url.toString());
  return focus;
}
