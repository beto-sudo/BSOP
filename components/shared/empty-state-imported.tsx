'use client';

/**
 * Empty state estándar para módulos Dilesa que arrancan sin datos.
 *
 * Mientras dilesa-1b termina de cargar datos desde Coda, o si el usuario
 * nunca ha capturado nada, cada master table renderiza este componente.
 *
 * El CTA primario dispara el callback de Alta (abre el Sheet). El secundario
 * es un placeholder para "Importar desde Coda" — cuando el flow de import
 * esté listo (lib/coda-paste-import.ts ya existe como base), se reemplaza
 * la prop `onImport` por un handler real.
 */

import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';

export function EmptyStateImported({
  entityLabel,
  description,
  onCreate,
  onImport,
}: {
  entityLabel: string;
  description?: string;
  onCreate: () => void;
  onImport?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-10 text-center">
      <div className="text-4xl">📦</div>
      <div>
        <h3 className="text-base font-semibold text-[var(--text)]">
          Aún no hay {entityLabel.toLowerCase()}
        </h3>
        <p className="mt-1 text-sm text-[var(--text)]/55">
          {description ?? `Captura el primero o importa desde Coda cuando esté disponible.`}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={onCreate}>
          <Plus className="size-4" />
          Capturar manual
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!onImport}
          onClick={onImport}
          title={onImport ? undefined : 'Próximamente'}
        >
          <Download className="size-4" />
          Importar desde Coda
        </Button>
      </div>
    </div>
  );
}
