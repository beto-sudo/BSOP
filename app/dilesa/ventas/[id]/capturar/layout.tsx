/**
 * Layout compartido para las páginas de captura de fase del pipeline
 * DILESA. Cada `app/dilesa/ventas/[id]/capturar/<fase-slug>/page.tsx`
 * lo hereda automáticamente.
 *
 * Aquí solo va el container del page — el header con back-link, el
 * título y la ficha "estás capturando la venta X" lo monta cada page
 * con `<CapturarFaseHeader>` (en components/dilesa/capturar-fase-header.tsx)
 * porque necesita el nombre del cliente que cada page sabe cargar.
 */
export default function CapturarLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>;
}
