export default function Home() {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-semibold text-slate-900">Bienvenido a BSOP</h2>
      <p className="text-slate-600">
        Este es el Core v1. Tienes el AppShell con Sidebar y Tailwind activos.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Compras</h3>
          <p className="text-sm text-slate-600">Crea y gestiona Órdenes de Compra.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Inventario</h3>
          <p className="text-sm text-slate-600">Entradas, salidas y ajustes.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Caja</h3>
          <p className="text-sm text-slate-600">Movimientos y cierres diarios.</p>
        </div>
      </div>
    </div>
  );
}
