'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * `subtipo_meta` stays loose to match the original pages and match the
 * jsonb schema; see components/documentos/types.ts for the rationale.
 */

/**
 * DocFormFields — common field set shared by both create and edit flows.
 *
 * Shares the tipo→meta→titulo auto-generation logic (Escritura titles are
 * derived from notaría + numero) so both sheets stay in sync.
 */

import type React from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import type { DocForm, NotariaOption } from './types';
import { TIPOS_DOCUMENTO } from './types';
import { autoTituloEscritura } from './helpers';
import { FLabel } from './ui';
import { SubtipoFields } from './documento-subtipo-fields';

export function DocFormFields({
  form,
  setForm,
  notarias,
  onOpenCreateNotaria,
}: {
  form: DocForm;
  setForm: React.Dispatch<React.SetStateAction<DocForm>>;
  notarias: NotariaOption[];
  onOpenCreateNotaria: () => void;
}) {
  const handleNotariaChange = (value: string | null) => {
    if (!value || value === '__none__') {
      setForm((f) => ({ ...f, notario_proveedor_id: '', notaria: '' }));
      return;
    }
    const sel = notarias.find((n) => n.id === value);
    setForm((f) => {
      const nf = { ...f, notario_proveedor_id: value, notaria: sel?.nombre ?? '' };
      if (f.tipo === 'Escritura') nf.titulo = autoTituloEscritura(nf);
      return nf;
    });
  };

  const handleTipoChange = (tipo: string | null) => {
    if (!tipo) return;
    setForm((f) => {
      const nf = { ...f, tipo };
      if (tipo === 'Escritura') nf.titulo = autoTituloEscritura(nf);
      return nf;
    });
  };

  const handleMetaChange = (meta: Record<string, any>) => {
    setForm((f) => {
      const nf = { ...f, subtipo_meta: meta };
      if (f.tipo === 'Escritura') nf.titulo = autoTituloEscritura(nf);
      return nf;
    });
  };

  const showNotaria = ['Escritura', 'Acta Constitutiva', 'Poder'].includes(form.tipo);

  return (
    <div className="space-y-4">
      {/* Tipo selector — first, drives everything */}
      <div>
        <FLabel req>Tipo de documento</FLabel>
        <Select value={form.tipo || undefined} onValueChange={handleTipoChange}>
          <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
            <SelectValue placeholder="Seleccionar tipo..." />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_DOCUMENTO.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="flex items-center gap-2">
                  {t.icon} {t.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type-specific fields */}
      {form.tipo && (
        <SubtipoFields tipo={form.tipo} meta={form.subtipo_meta} onChange={handleMetaChange} />
      )}

      {/* Título */}
      <div>
        <FLabel req>Título</FLabel>
        <Input
          placeholder={
            form.tipo === 'Escritura'
              ? 'Se genera automáticamente'
              : 'Ej: Contrato de arrendamiento oficina'
          }
          value={form.titulo}
          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          readOnly={form.tipo === 'Escritura'}
        />
        {form.tipo === 'Escritura' && (
          <p className="mt-1 text-[10px] text-[var(--text)]/40">
            Se genera a partir de los datos de la escritura.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FLabel>No. de documento</FLabel>
          <Input
            placeholder="Ej: 4521"
            value={form.numero_documento}
            onChange={(e) => setForm((f) => ({ ...f, numero_documento: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FLabel>Fecha de emisión</FLabel>
          <Input
            type="date"
            value={form.fecha_emision}
            onChange={(e) => setForm((f) => ({ ...f, fecha_emision: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      <div>
        <FLabel>Fecha de vencimiento</FLabel>
        <Input
          type="date"
          value={form.fecha_vencimiento}
          onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>

      {/* Notaría — only for relevant types */}
      {showNotaria && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <FLabel>Notaría</FLabel>
            <button
              type="button"
              onClick={onOpenCreateNotaria}
              className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80"
            >
              + Nueva notaría
            </button>
          </div>
          <Select
            value={form.notario_proveedor_id || '__none__'}
            onValueChange={handleNotariaChange}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar notaría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin asignar</SelectItem>
              {notarias.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <FLabel>Notas</FLabel>
        <Textarea
          placeholder="Observaciones adicionales..."
          value={form.notas}
          onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
          rows={3}
          className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>
    </div>
  );
}
