'use client';

/**
 * Presentational pieces for the `erp.task_updates` feature.
 * Used by the DILESA edit/create flow (both standalone sheet and embedded panel).
 */

import { Loader2, Clock, MessageSquarePlus } from 'lucide-react';
import {
  ESTADO_CONFIG,
  UPDATE_TIPO_CONFIG,
  type TaskEstado,
  type TaskUpdateRow,
  formatDate,
  formatDateTime,
} from './tasks-shared';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

type Variant = 'sheet' | 'embedded';

export function UpdatesList({
  updates,
  loading,
  variant = 'sheet',
}: {
  updates: TaskUpdateRow[];
  loading: boolean;
  variant?: Variant;
}) {
  if (loading) {
    return (
      <div
        className={
          variant === 'sheet'
            ? 'flex items-center justify-center py-6'
            : 'flex items-center justify-center py-4'
        }
      >
        <Loader2
          className={`${variant === 'sheet' ? 'h-5 w-5' : 'h-4 w-4'} animate-spin text-[var(--text)]/30`}
        />
      </div>
    );
  }

  if (updates.length === 0) {
    if (variant === 'embedded') {
      return (
        <p className="text-xs text-[var(--text-subtle)] text-center py-3">Sin actualizaciones</p>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Clock className="mb-2 h-8 w-8 text-[var(--text)]/20" />
        <p className="text-sm text-[var(--text)]/50">No hay actualizaciones registradas</p>
      </div>
    );
  }

  return (
    <div className={variant === 'embedded' ? 'space-y-2' : 'space-y-2'}>
      {updates.map((u) => {
        const tc = UPDATE_TIPO_CONFIG[u.tipo] ?? { label: u.tipo, cls: '' };
        const isEmbedded = variant === 'embedded';
        return (
          <div
            key={u.id}
            className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] ${isEmbedded ? 'px-3 py-2' : 'px-3 py-2.5'}`}
          >
            <div className={`flex items-center gap-2 ${isEmbedded ? 'mb-0.5' : 'mb-1'}`}>
              <span
                className={`inline-flex items-center rounded-lg border ${
                  isEmbedded ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                } font-medium ${tc.cls}`}
              >
                {tc.label}
              </span>
              <span className="text-[10px] text-[var(--text-subtle)]">
                {u.usuario?.nombre ?? 'Sistema'}
              </span>
              <span className="text-[10px] text-[var(--text)]/30 ml-auto">
                {isEmbedded ? formatDateTime(u.created_at) : formatDate(u.created_at)}
              </span>
            </div>
            {u.contenido && (
              <p className={`${isEmbedded ? 'text-xs' : 'text-sm'} text-[var(--text)]/80`}>
                {u.contenido}
              </p>
            )}
            {u.valor_anterior != null && u.valor_nuevo != null && (
              <p className={`${isEmbedded ? 'text-[10px]' : 'text-xs'} text-[var(--text)]/50`}>
                {u.tipo === 'cambio_estado'
                  ? `${ESTADO_CONFIG[u.valor_anterior as TaskEstado]?.label ?? u.valor_anterior} → ${ESTADO_CONFIG[u.valor_nuevo as TaskEstado]?.label ?? u.valor_nuevo}`
                  : `${u.valor_anterior || '—'} → ${u.valor_nuevo || '—'}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function UpdateComposer({
  value,
  onChange,
  onSubmit,
  saving,
  size = 'lg',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  saving: boolean;
  size?: 'sm' | 'lg';
}) {
  const isLarge = size === 'lg';
  return (
    <div className="space-y-3">
      {isLarge && (
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Nuevo avance
        </div>
      )}
      <Textarea
        placeholder={isLarge ? 'Describe el avance o actualización...' : 'Escribe un avance...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] ${isLarge ? 'min-h-[80px]' : 'min-h-[60px] text-sm'}`}
      />
      <Button
        onClick={onSubmit}
        disabled={saving || !value.trim()}
        size={isLarge ? undefined : 'sm'}
        className="w-full gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className={`${isLarge ? 'h-4 w-4' : 'h-3.5 w-3.5'} animate-spin`} />
        ) : (
          <MessageSquarePlus className={isLarge ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        )}
        {isLarge ? 'Guardar avance' : 'Agregar avance'}
      </Button>
    </div>
  );
}
