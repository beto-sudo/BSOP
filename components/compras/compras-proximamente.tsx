import { Hammer } from 'lucide-react';

/**
 * Placeholder "en construcción" para tabs del hub Compras (DILESA) que aún no
 * tienen su módulo funcional. Iniciativa `dilesa-compras` · Sprint 2 (se va
 * reemplazando por el módulo real conforme avanzan las fases B/C/D).
 *
 * Vive en `components/compras/` (D4: el componente compartido de compras
 * constructora-first se construye aquí; RDB no se toca en v1).
 */
export function ComprasProximamente({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="p-6">
      <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-[var(--border)] py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Hammer className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--text)]">{titulo}</h2>
        <p className="max-w-md text-sm text-[var(--text)]/60">{descripcion}</p>
        <span className="rounded-full bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--text)]/50">
          En construcción
        </span>
      </div>
    </div>
  );
}
