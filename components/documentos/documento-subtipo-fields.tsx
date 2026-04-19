'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * The meta shape is loose by design (Record<string, any>) — documentos
 * stores this as jsonb. Matches the original pages.
 */

/**
 * SubtipoFields — per-tipo metadata inputs (Escritura, Contrato, Seguro, etc.).
 */

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { FLabel } from './ui';

type Meta = Record<string, any>;
type MetaChange = (m: Meta) => void;

function v(meta: Meta, key: string): string {
  const val = meta[key];
  return typeof val === 'string' || typeof val === 'number' ? String(val) : '';
}

function EscrituraFields({ meta, onChange }: { meta: Meta; onChange: MetaChange }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">
        📜 Datos de Escritura
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel req>No. de Escritura</FLabel>
          <Input
            placeholder="4521"
            value={v(meta, 'numero_escritura')}
            onChange={(e) => onChange({ ...meta, numero_escritura: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FLabel req>Fecha de Escritura</FLabel>
          <Input
            type="date"
            value={v(meta, 'fecha_escritura')}
            onChange={(e) => onChange({ ...meta, fecha_escritura: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>
      <div>
        <FLabel>Volumen</FLabel>
        <Input
          placeholder="XXIV"
          value={v(meta, 'volumen')}
          onChange={(e) => onChange({ ...meta, volumen: e.target.value })}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>
    </div>
  );
}

function ContratoFields({ meta, onChange }: { meta: Meta; onChange: MetaChange }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">
        📋 Datos del Contrato
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel>Parte A</FLabel>
          <Input
            placeholder="Nombre parte A"
            value={v(meta, 'parte_a')}
            onChange={(e) => onChange({ ...meta, parte_a: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FLabel>Parte B</FLabel>
          <Input
            placeholder="Nombre parte B"
            value={v(meta, 'parte_b')}
            onChange={(e) => onChange({ ...meta, parte_b: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel>Vigencia (meses)</FLabel>
          <Input
            type="number"
            placeholder="12"
            value={v(meta, 'vigencia_meses')}
            onChange={(e) => onChange({ ...meta, vigencia_meses: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FLabel>Monto</FLabel>
          <Input
            placeholder="$0.00"
            value={v(meta, 'monto')}
            onChange={(e) => onChange({ ...meta, monto: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>
    </div>
  );
}

function SeguroFields({ meta, onChange }: { meta: Meta; onChange: MetaChange }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">
        🛡️ Datos del Seguro
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel req>No. de Póliza</FLabel>
          <Input
            placeholder="POL-2024-0001"
            value={v(meta, 'numero_poliza')}
            onChange={(e) => onChange({ ...meta, numero_poliza: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FLabel req>Aseguradora</FLabel>
          <Input
            placeholder="GNP, AXA, Qualitas"
            value={v(meta, 'aseguradora')}
            onChange={(e) => onChange({ ...meta, aseguradora: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel>Cobertura</FLabel>
          <Input
            placeholder="Todo riesgo"
            value={v(meta, 'cobertura')}
            onChange={(e) => onChange({ ...meta, cobertura: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FLabel>Prima anual</FLabel>
          <Input
            placeholder="$0.00"
            value={v(meta, 'prima_anual')}
            onChange={(e) => onChange({ ...meta, prima_anual: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>
    </div>
  );
}

function ActaConstitutivaFields({ meta, onChange }: { meta: Meta; onChange: MetaChange }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">
        🏛️ Datos del Acta Constitutiva
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel>No. de Acta</FLabel>
          <Input
            placeholder="12345"
            value={v(meta, 'numero_acta')}
            onChange={(e) => onChange({ ...meta, numero_acta: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FLabel>Fecha del Acta</FLabel>
          <Input
            type="date"
            value={v(meta, 'fecha_acta')}
            onChange={(e) => onChange({ ...meta, fecha_acta: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>
      <div>
        <FLabel>Entidad Constituida</FLabel>
        <Input
          placeholder="Nombre de la sociedad"
          value={v(meta, 'entidad')}
          onChange={(e) => onChange({ ...meta, entidad: e.target.value })}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>
      <div>
        <FLabel>Objeto Social</FLabel>
        <Input
          placeholder="Descripción breve"
          value={v(meta, 'objeto_social')}
          onChange={(e) => onChange({ ...meta, objeto_social: e.target.value })}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>
    </div>
  );
}

function PoderFields({ meta, onChange }: { meta: Meta; onChange: MetaChange }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">
        ⚖️ Datos del Poder
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel>Tipo de Poder</FLabel>
          <Select
            value={v(meta, 'tipo_poder') || undefined}
            onValueChange={(val) => onChange({ ...meta, tipo_poder: val })}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="General">General</SelectItem>
              <SelectItem value="Especial">Especial</SelectItem>
              <SelectItem value="Pleitos y cobranzas">Pleitos y cobranzas</SelectItem>
              <SelectItem value="Actos de administración">Actos de administración</SelectItem>
              <SelectItem value="Actos de dominio">Actos de dominio</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <FLabel>Fecha del Poder</FLabel>
          <Input
            type="date"
            value={v(meta, 'fecha_poder')}
            onChange={(e) => onChange({ ...meta, fecha_poder: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel>Otorgante</FLabel>
          <Input
            placeholder="Nombre del poderdante"
            value={v(meta, 'otorgante')}
            onChange={(e) => onChange({ ...meta, otorgante: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FLabel>Apoderado</FLabel>
          <Input
            placeholder="Nombre del apoderado"
            value={v(meta, 'apoderado')}
            onChange={(e) => onChange({ ...meta, apoderado: e.target.value })}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>
    </div>
  );
}

export function SubtipoFields({
  tipo,
  meta,
  onChange,
}: {
  tipo: string;
  meta: Meta;
  onChange: MetaChange;
}) {
  if (tipo === 'Escritura') return <EscrituraFields meta={meta} onChange={onChange} />;
  if (tipo === 'Contrato') return <ContratoFields meta={meta} onChange={onChange} />;
  if (tipo === 'Seguro') return <SeguroFields meta={meta} onChange={onChange} />;
  if (tipo === 'Acta Constitutiva')
    return <ActaConstitutivaFields meta={meta} onChange={onChange} />;
  if (tipo === 'Poder') return <PoderFields meta={meta} onChange={onChange} />;
  return null;
}
