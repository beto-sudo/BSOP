'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern de lectura que el resto de tabs del hub Ventas
 * (cf. app/dilesa/ventas/vendedores/page.tsx).
 */

/**
 * @module Ventas · Promociones (DILESA)
 * @responsive desktop-first
 *
 * Tab "Promociones" del hub Ventas (iniciativa `dilesa-descuentos-promos`,
 * Sprint 2). Administra el catálogo `dilesa.promociones`: el monto de cada
 * promo es el TOPE de descuento autorizado que el motor de cuadratura aplica
 * a la venta (`min(otorgado, monto)`), y la promo aplicable se auto-asigna al
 * capturar la venta. Aquí se meten/quitan/expiran promos.
 *
 * `productos_aplicables` vacío = aplica a TODOS los prototipos (misma
 * semántica que el filtro de `app/dilesa/ventas/nueva/page.tsx`).
 *
 * Gate: sub-slug `dilesa.ventas.promociones` (ADR-030 SS5). WRITE solo
 * Dirección/admin (igual que los buckets de descuento en Cuadratura).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgePercent, Pencil, Plus, RefreshCw } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useEffectiveUser } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Promo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  monto: number;
  productos_aplicables: string[];
  activa: boolean;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
};

type Producto = { id: string; nombre: string };

type FormState = {
  nombre: string;
  descripcion: string;
  monto: string;
  productos: string[];
  vigenciaInicio: string;
  vigenciaFin: string;
  activa: boolean;
};

const EMPTY_FORM: FormState = {
  nombre: '',
  descripcion: '',
  monto: '',
  productos: [],
  vigenciaInicio: '',
  vigenciaFin: '',
  activa: true,
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export default function PromocionesPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.promociones">
      <PromocionesBody />
    </RequireAccess>
  );
}

function PromocionesBody() {
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const toast = useToast();
  const { data: effectiveUser } = useEffectiveUser();
  const canWrite =
    !!effectiveUser?.isAdmin ||
    (effectiveUser?.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);

  const [promos, setPromos] = useState<Promo[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Promo | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [promoRes, prodRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('promociones')
        .select(
          'id, nombre, descripcion, monto, productos_aplicables, activa, vigencia_inicio, vigencia_fin'
        )
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('activa', { ascending: false })
        .order('nombre'),
      sb
        .schema('dilesa')
        .from('productos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('nombre'),
    ]);
    if (promoRes.error) {
      setError(getSupabaseErrorMessage(promoRes.error, 'No se pudo cargar el catálogo.'));
      setLoading(false);
      return;
    }
    setPromos((promoRes.data ?? []) as Promo[]);
    setProductos((prodRes.data ?? []) as Producto[]);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombrePorProducto = useMemo(
    () => new Map(productos.map((p) => [p.id, p.nombre])),
    [productos]
  );

  function abrirNueva() {
    setForm(EMPTY_FORM);
    setEditing('new');
  }

  function abrirEdicion(p: Promo) {
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      monto: String(p.monto),
      productos: p.productos_aplicables ?? [],
      vigenciaInicio: p.vigencia_inicio ?? '',
      vigenciaFin: p.vigencia_fin ?? '',
      activa: p.activa,
    });
    setEditing(p);
  }

  async function guardar() {
    const monto = Number(form.monto);
    if (!form.nombre.trim()) {
      toast.add({ title: 'Falta el nombre', type: 'error' });
      return;
    }
    if (!Number.isFinite(monto) || monto < 0) {
      toast.add({ title: 'Monto inválido', description: 'Debe ser un número ≥ 0.', type: 'error' });
      return;
    }
    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      monto,
      productos_aplicables: form.productos,
      activa: form.activa,
      vigencia_inicio: form.vigenciaInicio || null,
      vigencia_fin: form.vigenciaFin || null,
    };
    const res =
      editing === 'new'
        ? await sb
            .schema('dilesa')
            .from('promociones')
            .insert({ ...payload, empresa_id: DILESA_EMPRESA_ID })
        : await sb
            .schema('dilesa')
            .from('promociones')
            .update(payload)
            .eq('id', (editing as Promo).id);
    setSaving(false);
    if (res.error) {
      toast.add({
        title: 'No se pudo guardar',
        description: getSupabaseErrorMessage(res.error, 'Error desconocido.'),
        type: 'error',
      });
      return;
    }
    toast.add({ title: 'Promoción guardada', type: 'success' });
    setEditing(null);
    void cargar();
  }

  async function toggleActiva(p: Promo) {
    const { error: e } = await sb
      .schema('dilesa')
      .from('promociones')
      .update({ activa: !p.activa })
      .eq('id', p.id);
    if (e) {
      toast.add({
        title: 'No se pudo cambiar',
        description: getSupabaseErrorMessage(e, 'Error desconocido.'),
        type: 'error',
      });
      return;
    }
    void cargar();
  }

  function toggleProducto(id: string) {
    setForm((f) => ({
      ...f,
      productos: f.productos.includes(id)
        ? f.productos.filter((x) => x !== id)
        : [...f.productos, id],
    }));
  }

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Catálogo de promociones</h2>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
        <span className="text-sm text-[var(--text)]/60">
          {promos.length} promoción{promos.length === 1 ? '' : 'es'}
        </span>
        {canWrite ? (
          <Button type="button" size="sm" className="ml-auto" onClick={abrirNueva}>
            <Plus className="mr-1.5 size-3.5" /> Nueva promoción
          </Button>
        ) : null}
      </div>

      <p className="text-[11px] text-[var(--text)]/55">
        El <span className="font-medium">monto</span> de cada promo es el tope de descuento
        autorizado que la cuadratura aplica a la venta. Sin productos seleccionados, la promo aplica
        a todos los prototipos.
      </p>

      {editing && canWrite ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
            {editing === 'new' ? 'Nueva promoción' : `Editar · ${(editing as Promo).nombre}`}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Nombre">
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </Campo>
            <Campo label="Monto (tope de descuento)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              />
            </Campo>
            <Campo label="Descripción">
              <Input
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Vigencia inicio">
                <Input
                  type="date"
                  value={form.vigenciaInicio}
                  onChange={(e) => setForm((f) => ({ ...f, vigenciaInicio: e.target.value }))}
                />
              </Campo>
              <Campo label="Vigencia fin">
                <Input
                  type="date"
                  value={form.vigenciaFin}
                  onChange={(e) => setForm((f) => ({ ...f, vigenciaFin: e.target.value }))}
                />
              </Campo>
            </div>
          </div>

          <div className="mt-3">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/50">
              Prototipos aplicables ({form.productos.length === 0 ? 'todos' : form.productos.length}
              )
            </span>
            <div className="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2">
              {productos.map((p) => {
                const on = form.productos.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProducto(p.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${
                      on
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                        : 'border-[var(--border)] text-[var(--text)]/60'
                    }`}
                  >
                    {p.nombre}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text)]/80">
            <input
              type="checkbox"
              checked={form.activa}
              onChange={(e) => setForm((f) => ({ ...f, activa: e.target.checked }))}
            />
            Activa
          </label>

          <div className="mt-4 flex gap-2">
            <Button type="button" size="sm" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--text)]/50">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : promos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--border)] py-10 text-[var(--text)]/50">
          <BadgePercent className="h-6 w-6" />
          <p className="text-sm">Sin promociones en el catálogo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {promos.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-[var(--text)]">{p.nombre}</span>
                <Badge tone={p.activa ? 'success' : 'neutral'}>
                  {p.activa ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
              <span className="text-lg font-semibold tabular-nums text-[var(--text)]">
                {moneyFmt.format(p.monto)}
              </span>
              <span className="text-[11px] text-[var(--text)]/55">
                {(p.productos_aplicables ?? []).length === 0
                  ? 'Todos los prototipos'
                  : (p.productos_aplicables ?? [])
                      .map((id) => nombrePorProducto.get(id) ?? '—')
                      .join(', ')}
              </span>
              {p.vigencia_inicio || p.vigencia_fin ? (
                <span className="text-[11px] text-[var(--text)]/45">
                  Vigencia: {p.vigencia_inicio ?? '…'} → {p.vigencia_fin ?? '…'}
                </span>
              ) : null}
              {canWrite ? (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => abrirEdicion(p)}
                    className="flex items-center gap-1 text-[11px] text-[var(--text)]/65 hover:text-[var(--text)]"
                  >
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActiva(p)}
                    className="text-[11px] text-[var(--text)]/65 hover:text-[var(--text)]"
                  >
                    {p.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </span>
      {children}
    </label>
  );
}
