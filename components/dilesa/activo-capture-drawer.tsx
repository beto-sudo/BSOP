'use client';

/**
 * ActivoCaptureDrawer — alta y edición de un activo del portafolio DILESA.
 * Iniciativa `dilesa-portafolio-expediente` · Sprint 1 (el desbloqueo: el módulo
 * era read-only).
 *
 * Renderiza el form desde la config (`lib/dilesa/activo-form-fields.ts`): master
 * común + satélite por tipo. Al guardar, separa los valores en dos jsonb y llama
 * `crearActivo`/`actualizarActivo` (RPC atómica master+satélite). El gate
 * admin/Dirección lo aplican el caller (botón) y la server action.
 */

import { useEffect, useState } from 'react';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
  DetailDrawerSkeleton,
} from '@/components/detail-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { crearActivo, actualizarActivo } from '@/app/dilesa/portafolio/actions';
import {
  MASTER_FIELDS,
  TIPOS_ACTIVO,
  getSateliteFields,
  groupBySection,
  type ActivoFieldDef,
} from '@/lib/dilesa/activo-form-fields';

type Destino = { id: string; label: string };
type FieldValue = string | boolean;

export function ActivoCaptureDrawer({
  empresaId,
  activoId,
  open,
  onOpenChange,
  onSaved,
}: {
  empresaId: string;
  /** null = alta; uuid = edición. */
  activoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const esEdicion = activoId != null;
  const [tipo, setTipo] = useState<string>('terreno');
  const [destinoId, setDestinoId] = useState<string>('');
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  // loading arranca true en edición (el caller remonta con `key`, así el
  // initializer corre fresco) → no hace falta setLoading(true) dentro del effect.
  const [loading, setLoading] = useState(esEdicion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, v: FieldValue) => setValues((prev) => ({ ...prev, [key]: v }));

  // Catálogo de destinos (para el select).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void createSupabaseBrowserClient()
      .schema('dilesa')
      .from('portafolio_destinos')
      .select('id, label')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .is('deleted_at', null)
      .order('orden')
      .then(({ data }) => {
        if (alive) setDestinos((data ?? []) as Destino[]);
      });
    return () => {
      alive = false;
    };
  }, [open, empresaId]);

  // Edición: cargar master + satélite y precargar el form. (Alta no necesita
  // reset: el caller remonta con `key`, así los useState arrancan limpios.)
  useEffect(() => {
    if (!open || !activoId) return;
    let alive = true;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: a, error: e } = await sb
        .schema('dilesa')
        .from('activos')
        .select(
          'tipo, nombre, estado, destino_id, clave_interna, municipio, estado_geo, direccion_referencia, latitud, longitud, area_m2, situacion_legal, numero_escritura, clave_catastral, valor_estimado, notas'
        )
        .eq('id', activoId)
        .maybeSingle();
      if (!alive) return;
      if (e || !a) {
        setError(getSupabaseErrorMessage(e, 'No se pudo cargar el activo.'));
        setLoading(false);
        return;
      }
      const act = a as Record<string, unknown>;
      const t = String(act.tipo);
      const next: Record<string, FieldValue> = {};
      for (const f of MASTER_FIELDS) {
        const raw = act[f.key];
        next[f.key] = f.type === 'checkbox' ? Boolean(raw) : raw == null ? '' : String(raw);
      }
      // Satélite del tipo.
      const satFields = getSateliteFields(t);
      if (satFields.length > 0) {
        const { data: sat } = await sb
          .schema('dilesa')
          .from(`activo_${t}` as 'activo_casa')
          .select('*')
          .eq('activo_id', activoId)
          .maybeSingle();
        if (!alive) return;
        const satRow = (sat as Record<string, unknown> | null) ?? {};
        for (const f of satFields) {
          const raw = satRow[f.key];
          next[f.key] = f.type === 'checkbox' ? Boolean(raw) : raw == null ? '' : String(raw);
        }
      }
      setTipo(t);
      setDestinoId(act.destino_id ? String(act.destino_id) : '');
      setValues(next);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, activoId]);

  const handleGuardar = async () => {
    setBusy(true);
    setError(null);
    const masterKeys = new Set(MASTER_FIELDS.map((f) => f.key));
    const satKeys = new Set(getSateliteFields(tipo).map((f) => f.key));
    const master: Record<string, string | boolean | null> = { destino_id: destinoId || null };
    const satelite: Record<string, string | boolean | null> = {};
    for (const [k, v] of Object.entries(values)) {
      if (masterKeys.has(k)) master[k] = v;
      else if (satKeys.has(k)) satelite[k] = v;
    }
    const r = esEdicion
      ? await actualizarActivo(activoId, master, satelite)
      : await crearActivo(tipo, master, satelite);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onSaved();
    onOpenChange(false);
  };

  const renderField = (f: ActivoFieldDef) => {
    const v = values[f.key];
    if (f.type === 'checkbox') {
      return (
        <label key={f.key} className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={v === true}
            onChange={(e) => set(f.key, e.currentTarget.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="text-[var(--text)]/80">{f.label}</span>
        </label>
      );
    }
    return (
      <label key={f.key} className="grid gap-1 py-1 text-sm">
        <span className="text-[var(--text)]/70">{f.label}</span>
        {f.type === 'select' ? (
          <select
            value={String(v ?? '')}
            onChange={(e) => set(f.key, e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : f.type === 'textarea' ? (
          <textarea
            value={String(v ?? '')}
            onChange={(e) => set(f.key, e.target.value)}
            rows={3}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]"
          />
        ) : (
          <Input
            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            inputMode={f.type === 'number' ? 'decimal' : undefined}
            value={String(v ?? '')}
            onChange={(e) => set(f.key, e.currentTarget.value)}
          />
        )}
      </label>
    );
  };

  const masterSections = groupBySection(MASTER_FIELDS);
  const satSections = groupBySection(getSateliteFields(tipo));

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
      size="lg"
      title={esEdicion ? 'Editar activo' : 'Nuevo activo'}
      description={
        esEdicion
          ? 'Actualiza los datos del activo y su detalle por tipo.'
          : 'Captura un activo del portafolio (terreno en evaluación, espectacular, lote, etc.).'
      }
    >
      <DetailDrawerContent>
        {loading ? (
          <DetailDrawerSkeleton />
        ) : (
          <>
            <DetailDrawerSection title="Tipo y destino" divider={false}>
              {!esEdicion ? (
                <label className="grid gap-1 py-1 text-sm">
                  <span className="text-[var(--text)]/70">Tipo de activo</span>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
                  >
                    {TIPOS_ACTIVO.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="grid gap-1 py-1 text-sm">
                <span className="text-[var(--text)]/70">Destino</span>
                <select
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
                >
                  <option value="">— Sin destino —</option>
                  {destinos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </DetailDrawerSection>

            {masterSections.map(([section, fields]) => (
              <DetailDrawerSection key={`m-${section}`} title={section}>
                {fields.map(renderField)}
              </DetailDrawerSection>
            ))}

            {satSections.map(([section, fields]) => (
              <DetailDrawerSection key={`s-${section}`} title={section}>
                {fields.map(renderField)}
              </DetailDrawerSection>
            ))}

            {error ? <p className="py-2 text-sm text-[var(--danger)]">{error}</p> : null}

            <div className="flex justify-end gap-2 py-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={() => void handleGuardar()} disabled={busy}>
                {busy ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear activo'}
              </Button>
            </div>
          </>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
