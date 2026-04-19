/**
 * Shared status-badge token maps used by juntas, tasks, empleados, etc.
 *
 * Keeping these in one place avoids the drift we had when the same config
 * was copy-pasted across DILESA/RDB/Inicio listing and detail pages.
 * If you need a new status, add it here (not inline in a page).
 */

export type JuntaEstado = 'programada' | 'en_curso' | 'completada' | 'cancelada';

export const JUNTA_ESTADO_CONFIG: Record<JuntaEstado, { label: string; cls: string }> = {
  programada: {
    label: 'Programada',
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  en_curso: {
    label: 'En curso',
    cls: 'bg-green-500/15 text-green-400 border-green-500/20',
  },
  completada: {
    label: 'Completada',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/50 border-[var(--border)]',
  },
  cancelada: {
    label: 'Cancelada',
    cls: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
};
