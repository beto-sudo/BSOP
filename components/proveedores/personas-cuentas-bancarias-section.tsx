'use client';

/**
 * Sección de cuentas bancarias de una persona (proveedor).
 * Sub-componente del drawer (RDB Sprint 2 de `rdb-proveedores-data-completion`).
 *
 * Lee/escribe `erp.personas_cuentas_bancarias`. FK opcional a `core.bancos`,
 * fallback `banco_nombre` libre. Multi-cuenta, una vigente.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X, Save, Trash2, RotateCcw, Pencil, CheckCircle2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  TIPO_CUENTA_BANCARIA,
  TIPO_CUENTA_BANCARIA_LABEL,
  formatCuentaCompact,
  validateCuentaBancaria,
  type PersonaCuentaBancaria,
  type PersonaCuentaBancariaInsert,
  type TipoCuentaBancaria,
} from '@/lib/personas/satellites';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Props = {
  personaId: string;
  empresaId: string;
};

type Banco = { id: string; codigo: string; nombre: string };

type FormState = {
  banco_id: string; // '' = sin selección, usa banco_nombre
  banco_nombre: string;
  numero_cuenta: string;
  clabe: string;
  tipo: TipoCuentaBancaria | '';
  moneda: string;
  notas: string;
  vigente: boolean;
};

const EMPTY_FORM: FormState = {
  banco_id: '',
  banco_nombre: '',
  numero_cuenta: '',
  clabe: '',
  tipo: '',
  moneda: 'MXN',
  notas: '',
  vigente: false,
};

export function PersonasCuentasBancariasSection({ personaId, empresaId }: Props) {
  const [cuentas, setCuentas] = useState<PersonaCuentaBancaria[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const bancoLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bancos) m.set(b.id, b.nombre);
    return m;
  }, [bancos]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const [ctasRes, bancosRes] = await Promise.all([
        supabase
          .schema('erp')
          .from('personas_cuentas_bancarias')
          .select('*')
          .eq('persona_id', personaId)
          .order('vigente', { ascending: false })
          .order('created_at', { ascending: true }),
        supabase
          .schema('core')
          .from('bancos')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
      ]);
      if (ctasRes.error) throw ctasRes.error;
      if (bancosRes.error) throw bancosRes.error;
      setCuentas((ctasRes.data ?? []) as PersonaCuentaBancaria[]);
      setBancos((bancosRes.data ?? []) as Banco[]);
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con cuentas bancarias'));
    } finally {
      setLoading(false);
    }
  }, [personaId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowAdd(true);
  };

  const startEdit = (c: PersonaCuentaBancaria) => {
    setEditingId(c.id);
    setForm({
      banco_id: c.banco_id ?? '',
      banco_nombre: c.banco_nombre ?? '',
      numero_cuenta: c.numero_cuenta ?? '',
      clabe: c.clabe ?? '',
      tipo: (c.tipo as TipoCuentaBancaria | null) ?? '',
      moneda: c.moneda,
      notas: c.notas ?? '',
      vigente: c.vigente,
    });
    setShowAdd(true);
  };

  const cancelForm = () => {
    setShowAdd(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    const validationError = validateCuentaBancaria({
      banco_id: form.banco_id || null,
      banco_nombre: form.banco_nombre || null,
      numero_cuenta: form.numero_cuenta || null,
      clabe: form.clabe || null,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();

      // Si se marca como vigente, desmarcar las otras vigentes
      // (DB tiene partial unique, lo rechazaría).
      if (form.vigente) {
        await supabase
          .schema('erp')
          .from('personas_cuentas_bancarias')
          .update({ vigente: false })
          .eq('persona_id', personaId)
          .eq('vigente', true);
      }

      const payload = {
        banco_id: form.banco_id || null,
        // Si banco_id está, banco_nombre se omite (banco real viene del catálogo).
        banco_nombre: form.banco_id ? null : form.banco_nombre.trim() || null,
        numero_cuenta: form.numero_cuenta.trim() || null,
        clabe: form.clabe.trim() || null,
        tipo: form.tipo || null,
        moneda: form.moneda || 'MXN',
        notas: form.notas.trim() || null,
        vigente: form.vigente,
      };

      if (editingId) {
        const { error: err } = await supabase
          .schema('erp')
          .from('personas_cuentas_bancarias')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const insert: PersonaCuentaBancariaInsert = {
          ...payload,
          persona_id: personaId,
          empresa_id: empresaId,
        };
        const { error: err } = await supabase
          .schema('erp')
          .from('personas_cuentas_bancarias')
          .insert(insert);
        if (err) throw err;
      }

      cancelForm();
      await fetchAll();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con cuentas bancarias'));
    } finally {
      setSaving(false);
    }
  };

  const toggleVigente = async (c: PersonaCuentaBancaria) => {
    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Soft-delete por vigente=false; al reactivar otras, el partial unique se respeta.
      const newVigente = !c.vigente;
      if (newVigente) {
        await supabase
          .schema('erp')
          .from('personas_cuentas_bancarias')
          .update({ vigente: false })
          .eq('persona_id', personaId)
          .eq('vigente', true)
          .neq('id', c.id);
      }
      const { error: err } = await supabase
        .schema('erp')
        .from('personas_cuentas_bancarias')
        .update({ vigente: newVigente })
        .eq('id', c.id);
      if (err) throw err;
      await fetchAll();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con cuentas bancarias'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Separator className="my-4" />
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Cuentas bancarias
        </div>
        {!showAdd && (
          <Button variant="ghost" size="sm" onClick={startAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Agregar
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {cuentas.length === 0 && !showAdd && (
            <p className="text-xs text-muted-foreground">Sin cuentas capturadas</p>
          )}

          <ul className="space-y-2">
            {cuentas.map((c) => {
              const bancoLabel = c.banco_id
                ? (bancoLabelMap.get(c.banco_id) ?? '(banco no encontrado)')
                : c.banco_nombre;
              return (
                <li
                  key={c.id}
                  className={`rounded-md border p-2 text-sm ${c.vigente ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs">
                          {formatCuentaCompact({
                            banco_label: bancoLabel,
                            numero_cuenta: c.numero_cuenta,
                            clabe: c.clabe,
                          })}
                        </span>
                        {c.vigente && (
                          <Badge variant="default" className="text-[10px]">
                            <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                            Vigente
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {c.tipo && (
                          <span>
                            {TIPO_CUENTA_BANCARIA_LABEL[c.tipo as TipoCuentaBancaria] ?? c.tipo}
                          </span>
                        )}
                        <span>{c.moneda}</span>
                      </div>
                      {c.notas && (
                        <div className="mt-0.5 text-xs italic text-muted-foreground">{c.notas}</div>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(c)}
                        disabled={saving}
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleVigente(c)}
                        disabled={saving}
                        aria-label={c.vigente ? 'Marcar no vigente' : 'Marcar vigente'}
                      >
                        {c.vigente ? (
                          <Trash2 className="h-3.5 w-3.5" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {showAdd && (
            <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-semibold">
                {editingId ? 'Editar cuenta' : 'Nueva cuenta'}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Banco
                </label>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={form.banco_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      banco_id: e.target.value,
                      // Si elige catálogo, limpia banco_nombre libre
                      banco_nombre: e.target.value ? '' : f.banco_nombre,
                    }))
                  }
                >
                  <option value="">— Banco no catalogado —</option>
                  {bancos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {!form.banco_id && (
                <Input
                  placeholder="Nombre del banco (libre)"
                  value={form.banco_nombre}
                  onChange={(e) => setForm((f) => ({ ...f, banco_nombre: e.target.value }))}
                />
              )}

              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Número de cuenta"
                  value={form.numero_cuenta}
                  onChange={(e) => setForm((f) => ({ ...f, numero_cuenta: e.target.value }))}
                />
                <Input
                  placeholder="CLABE (18 dígitos)"
                  value={form.clabe}
                  onChange={(e) => setForm((f) => ({ ...f, clabe: e.target.value }))}
                  maxLength={18}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={form.tipo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tipo: e.target.value as TipoCuentaBancaria | '' }))
                  }
                >
                  <option value="">— Tipo —</option>
                  {TIPO_CUENTA_BANCARIA.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_CUENTA_BANCARIA_LABEL[t]}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Moneda (MXN)"
                  value={form.moneda}
                  onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}
                />
              </div>

              <Input
                placeholder="Notas"
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              />

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.vigente}
                  onChange={(e) => setForm((f) => ({ ...f, vigente: e.target.checked }))}
                />
                Marcar como cuenta vigente para pagos
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={cancelForm} disabled={saving}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
