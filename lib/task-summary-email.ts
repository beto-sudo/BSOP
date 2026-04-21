// ── Daily task summary email HTML generator for BSOP ───────────────────────
//
// Generates the morning summary with pending tasks grouped by urgency:
//   🔴 Vencidas  ·  🟡 Hoy  ·  🟢 Esta semana  ·  ⚪ Más adelante  ·  ⬜ Sin fecha
//
// Empty sections are not rendered. If there are zero total tasks, the caller
// should NOT invoke this function and skip the email entirely.

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export type TaskSummaryItem = {
  id: string;
  titulo: string;
  empresaNombre: string;
  fechaVence: string | null; // ISO date (YYYY-MM-DD) or null
  fechaCompromiso: string | null;
  porcentajeAvance: number;
};

export type TaskSummaryGroups = {
  vencidas: TaskSummaryItem[];
  hoy: TaskSummaryItem[];
  estaSemana: TaskSummaryItem[];
  masAdelante: TaskSummaryItem[];
  sinFecha: TaskSummaryItem[];
};

/**
 * Split task rows into urgency buckets relative to `todayCst` (ISO date).
 * Uses `fecha_vence` first, falls back to `fecha_compromiso`, null → sinFecha.
 *
 * Sorting inside each bucket:
 *   vencidas / hoy / estaSemana / masAdelante → by date ASC
 *   sinFecha → by titulo ASC
 */
export function groupTasksByUrgency(tasks: TaskSummaryItem[], todayCst: string): TaskSummaryGroups {
  const todayMs = Date.parse(`${todayCst}T00:00:00Z`);
  const weekAheadMs = todayMs + 7 * 24 * 60 * 60 * 1000;

  const groups: TaskSummaryGroups = {
    vencidas: [],
    hoy: [],
    estaSemana: [],
    masAdelante: [],
    sinFecha: [],
  };

  for (const task of tasks) {
    const dueDate = task.fechaVence ?? task.fechaCompromiso;
    if (!dueDate) {
      groups.sinFecha.push(task);
      continue;
    }
    const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
    if (dueMs < todayMs) groups.vencidas.push(task);
    else if (dueMs === todayMs) groups.hoy.push(task);
    else if (dueMs <= weekAheadMs) groups.estaSemana.push(task);
    else groups.masAdelante.push(task);
  }

  const sortByDate = (a: TaskSummaryItem, b: TaskSummaryItem) => {
    const aDate = a.fechaVence ?? a.fechaCompromiso ?? '';
    const bDate = b.fechaVence ?? b.fechaCompromiso ?? '';
    return aDate.localeCompare(bDate);
  };
  groups.vencidas.sort(sortByDate);
  groups.hoy.sort(sortByDate);
  groups.estaSemana.sort(sortByDate);
  groups.masAdelante.sort(sortByDate);
  groups.sinFecha.sort((a, b) => a.titulo.localeCompare(b.titulo));

  return groups;
}

export function formatShortDateEs(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${parseInt(d, 10)} ${MONTHS_ES[parseInt(m, 10) - 1]} ${y}`;
}

/** Human-friendly description of how far in the past a vencidas task is. */
function formatOverdue(dueDate: string, todayCst: string): string {
  const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
  const todayMs = Date.parse(`${todayCst}T00:00:00Z`);
  const days = Math.floor((todayMs - dueMs) / (24 * 60 * 60 * 1000));
  if (days === 1) return 'Venció ayer';
  return `Venció hace ${days} días`;
}

function renderTaskRow(
  task: TaskSummaryItem,
  todayCst: string,
  urgency: keyof TaskSummaryGroups
): string {
  const dueDate = task.fechaVence ?? task.fechaCompromiso;
  let dueLabel = '';
  if (urgency === 'vencidas' && dueDate) {
    dueLabel = formatOverdue(dueDate, todayCst);
  } else if (urgency === 'hoy') {
    dueLabel = 'Vence hoy';
  } else if (dueDate) {
    dueLabel = `Vence ${formatShortDateEs(dueDate)}`;
  }

  const avanceLabel =
    task.porcentajeAvance > 0 && task.porcentajeAvance < 100
      ? ` · ${task.porcentajeAvance}% avance`
      : '';

  const metaLine = [task.empresaNombre, dueLabel].filter(Boolean).join(' · ');

  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-size:14px;font-weight:500;color:#1a1a1a;line-height:1.4">${escapeHtml(task.titulo)}</td></tr>
          <tr><td style="font-size:12px;color:#888;padding-top:2px">${escapeHtml(metaLine)}${avanceLabel}</td></tr>
        </table>
      </td>
    </tr>`;
}

function renderSection(
  title: string,
  icon: string,
  tasks: TaskSummaryItem[],
  todayCst: string,
  urgency: keyof TaskSummaryGroups
): string {
  if (tasks.length === 0) return '';
  const rows = tasks.map((t) => renderTaskRow(t, todayCst, urgency)).join('');
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-top:20px">
      <tr>
        <td style="font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px">
          ${icon} ${title} (${tasks.length})
        </td>
      </tr>
      ${rows}
    </table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateTaskSummaryHtml(
  firstName: string,
  groups: TaskSummaryGroups,
  todayCst: string
): string {
  const total =
    groups.vencidas.length +
    groups.hoy.length +
    groups.estaSemana.length +
    groups.masAdelante.length +
    groups.sinFecha.length;

  const sections = [
    renderSection('Vencidas', '🔴', groups.vencidas, todayCst, 'vencidas'),
    renderSection('Hoy', '🟡', groups.hoy, todayCst, 'hoy'),
    renderSection('Esta semana', '🟢', groups.estaSemana, todayCst, 'estaSemana'),
    renderSection('Más adelante', '⚪', groups.masAdelante, todayCst, 'masAdelante'),
    renderSection('Sin fecha', '⬜', groups.sinFecha, todayCst, 'sinFecha'),
  ].join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0f0f0">
<tr><td align="center" style="padding:24px 16px">

  <table cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e5e5">

    <tr>
      <td style="background:#f8f8f8;padding:24px 32px;text-align:center;border-bottom:1px solid #e5e5e5;border-radius:12px 12px 0 0">
        <img src="https://bsop.io/logo-bsop.jpg" alt="BSOP" width="140" style="display:block;margin:0 auto"/>
      </td>
    </tr>

    <tr>
      <td style="padding:28px 32px 24px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-size:20px;font-weight:700;color:#1a1a1a;padding-bottom:4px">Buenos días, ${escapeHtml(firstName)} 👋</td></tr>
          <tr><td style="font-size:15px;color:#555;line-height:1.5;padding-bottom:8px">Tienes <strong>${total}</strong> ${total === 1 ? 'tarea abierta' : 'tareas abiertas'} en BSOP.</td></tr>
        </table>

        ${sections}

        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-top:28px">
          <tr><td align="center">
            <a href="https://bsop.io" style="display:inline-block;background:#F7941D;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.3px">Abrir BSOP</a>
          </td></tr>
        </table>

        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-top:20px">
          <tr><td style="font-size:12px;color:#888;line-height:1.5;text-align:center">
            Si alguna tarea ya no aplica, responde este correo o márcala como completada en BSOP.
          </td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#f8f8f8;padding:14px 32px;text-align:center;border-top:1px solid #e5e5e5;border-radius:0 0 12px 12px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="font-size:11px;color:#999">BSOP · Sistema Operativo</td></tr>
        </table>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}
