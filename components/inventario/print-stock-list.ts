import type { StockItem } from './types';

/**
 * Abre una nueva ventana con el reporte imprimible de inventario:
 * tabla de productos con stock > 0 + resumen por categoría con total.
 *
 * Si `fechaCorte` (ISO date `YYYY-MM-DD`) viene, el reporte se etiqueta
 * como "Inventario al Corte" para esa fecha; si no, usa la fecha actual.
 */
export function printStockList(stock: StockItem[], fechaCorte: string | null) {
  const totalValor = stock.reduce((s, i) => s + Math.max(0, Number(i.valor_inventario) || 0), 0);
  const fechaLabel = fechaCorte
    ? new Date(fechaCorte + 'T12:00:00').toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const fecha =
    fechaLabel ??
    new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  // Solo productos con stock > 0 (excluir ceros y negativos del impreso — para contabilidad)
  const stockPositivo = stock.filter((i) => Number(i.stock_actual) > 0);

  // Agrupar por categoría para el resumen final
  const catOrder = [
    'Licores',
    'Bebidas',
    'Alimentos',
    'Consumibles',
    'Artículos',
    'Deportes',
    'Propinas',
  ];
  const catMap: Record<string, { count: number; valor: number }> = {};
  for (const item of stockPositivo) {
    const cat = item.categoria ?? 'Sin categoría';
    if (!catMap[cat]) catMap[cat] = { count: 0, valor: 0 };
    catMap[cat].count++;
    catMap[cat].valor += Number(item.valor_inventario) || 0;
  }
  const catEntries = [
    ...catOrder
      .filter((c) => catMap[c])
      .map((c) => [c, catMap[c]] as [string, { count: number; valor: number }]),
    ...Object.entries(catMap).filter(([c]) => !catOrder.includes(c)),
  ];

  const catRows = catEntries
    .map(
      ([cat, s]) => `
      <tr>
        <td>${cat}</td>
        <td class="num">${s.count}</td>
        <td class="num">$${s.valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      </tr>
    `
    )
    .join('');

  const rows = stockPositivo
    .map((item) => {
      const sinStock = item.stock_actual <= 0;
      const bajoMin = item.bajo_minimo;
      const estadoText = sinStock ? 'Sin stock' : bajoMin ? 'Bajo mínimo' : '✓';
      const estadoClass = sinStock ? 'estado-sin-stock' : bajoMin ? 'estado-bajo' : 'estado-ok';
      return `
      <tr>
        <td>${item.nombre}</td>
        <td>${item.categoria ?? '—'}</td>
        <td class="num ${sinStock ? 'rojo' : bajoMin ? 'naranja' : ''}">${item.stock_actual} ${item.unidad ?? 'pzs'}</td>
        <td class="num gris">${item.stock_minimo ?? '—'}</td>
        <td class="num">${item.costo_unitario != null ? '$' + Number(item.costo_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}</td>
        <td class="num">${item.valor_inventario != null ? '$' + Number(item.valor_inventario).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}</td>
        <td class="nowrap ${estadoClass}">${estadoText}</td>
      </tr>
    `;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Inventario RDB — ${fecha}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }

    /* ── Membrete ──────────────────────────────────────────────── */
    .membrete { margin-bottom: 0; }
    .membrete img { width: 100%; height: auto; display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-meta { font-size: 10px; color: #555; margin: 6px 0 14px; display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding-bottom: 6px; }

    /* ── Tabla principal ───────────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; }
    th { font-weight: 700; text-align: left; padding: 5px 6px; border-bottom: 2px solid #1a1a2e; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #1a1a2e; background: #f5f5f8; }
    td { padding: 3.5px 6px; border-bottom: 1px solid #eee; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #fafafa; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .nowrap { white-space: nowrap; }
    .gris { color: #999; }
    .rojo { color: #dc2626; font-weight: 600; }
    .naranja { color: #d97706; font-weight: 600; }
    .estado-sin-stock { color: #dc2626; font-weight: 600; }
    .estado-bajo { color: #d97706; font-weight: 600; }
    .estado-ok { color: #16a34a; }

    /* ── Resumen por categoría (solo al final) ─────────────────── */
    .resumen-section { margin-top: 28px; page-break-inside: avoid; }
    .resumen-section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 4px; margin-bottom: 8px; }
    .resumen-table { width: 340px; border-collapse: collapse; }
    .resumen-table th { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #444; padding: 3px 8px; border-bottom: 1px solid #ccc; background: #f5f5f8; }
    .resumen-table td { padding: 3px 8px; border-bottom: 1px solid #eee; font-size: 10.5px; }
    .resumen-table tr:last-child td { border-bottom: none; }
    .resumen-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .resumen-total { margin-top: 6px; width: 340px; border-collapse: collapse; }
    .resumen-total td { padding: 5px 8px; font-size: 12px; font-weight: 800; color: #1a1a2e; border-top: 2px solid #1a1a2e; }
    .resumen-total .num { text-align: right; font-variant-numeric: tabular-nums; }

    @media print {
      body { padding: 12px 16px; }
      .membrete { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- Membrete empresa -->
  <div class="membrete">
    <img src="/brand/rdb/header-email.png" alt="Rincón del Bosque" />
  </div>
  <div class="doc-meta">
    <span>${fechaCorte ? `Inventario al Corte: <strong>${fecha}</strong>` : `Inventario de Stock &mdash; <strong>${fecha}</strong>`}</span>
    <span>${stockPositivo.length} productos registrados</span>
  </div>

  <!-- Tabla de inventario -->
  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th>Categoría</th>
        <th class="num">Stock</th>
        <th class="num">Mínimo</th>
        <th class="num">Costo Unit.</th>
        <th class="num">Valor Total</th>
        <th class="nowrap">Estado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Resumen por categoría — solo al final del documento -->
  <div class="resumen-section">
    <h2>Resumen por Categoría</h2>
    <table class="resumen-table">
      <thead>
        <tr>
          <th>Categoría</th>
          <th class="num">Productos</th>
          <th class="num">Valor</th>
        </tr>
      </thead>
      <tbody>${catRows}</tbody>
    </table>
    <table class="resumen-total">
      <tr>
        <td>TOTAL INVENTARIO</td>
        <td class="num">$${totalValor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      </tr>
    </table>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}
