'use client';

/**
 * Drawer de edición de los datos de un cliente DILESA (`erp.personas`).
 *
 * Solo se monta para usuarios autorizados (Dirección/admin — el botón que lo
 * abre está gateado en la page). El guardado pega a
 * `PATCH /api/dilesa/clientes/[id]`, que vuelve a validar el permiso y audita
 * el cambio server-side.
 */

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
} from '@/components/detail-page/detail-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  TIPO_PERSONA_OPTIONS,
  NACIONALIDAD_OPTIONS,
  FORMA_PAGO_OPTIONS,
  USO_EFECTIVO_OPTIONS,
  ESTADO_CIVIL_OPTIONS,
  OCUPACION_OPTIONS,
} from '@/lib/dilesa/ficu/catalogos';
import type { ClienteEditInput } from '@/lib/dilesa/cliente-edit';

type Props = {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inicial: ClienteEditInput;
  onSaved: () => void;
};

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm';

export function ClienteEditarDrawer({ id, open, onOpenChange, inicial, onSaved }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<ClienteEditInput>(inicial);
  const [saving, setSaving] = useState(false);

  // Reset al abrir, desde el snapshot actual del cliente.
  useEffect(() => {
    if (open) setForm(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function set<K extends keyof ClienteEditInput>(col: K, value: ClienteEditInput[K]) {
    setForm((f) => ({ ...f, [col]: value }));
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      toast.add({ title: 'El nombre es obligatorio', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/dilesa/clientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        cambios?: number;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        toast.add({
          title: 'No se pudo guardar',
          description: json?.error ?? `Error ${res.status}`,
          type: 'error',
        });
        return;
      }
      toast.add({
        title: json.cambios ? 'Datos del cliente actualizados' : 'Sin cambios',
        description: json.cambios
          ? `${json.cambios} campo${json.cambios === 1 ? '' : 's'} actualizado${json.cambios === 1 ? '' : 's'}. Reimprime el FICU para la versión corregida.`
          : 'No detectamos cambios respecto a lo guardado.',
        type: 'success',
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.add({
        title: 'No se pudo guardar',
        description: getSupabaseErrorMessage(e, 'Error de red.'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Editar datos del cliente"
      description="Los cambios quedan registrados (quién y qué cambió). Reimprime el FICU después para archivar la versión corregida."
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar
          </Button>
        </div>
      }
    >
      <DetailDrawerContent>
        <DetailDrawerSection title="Datos personales" divider={false}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre *">
              <Input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
            </Field>
            <div />
            <Field label="Apellido paterno">
              <Input
                value={form.apellido_paterno}
                onChange={(e) => set('apellido_paterno', e.target.value)}
              />
            </Field>
            <Field label="Apellido materno">
              <Input
                value={form.apellido_materno}
                onChange={(e) => set('apellido_materno', e.target.value)}
              />
            </Field>
            <Field label="CURP">
              <Input
                value={form.curp}
                onChange={(e) => set('curp', e.target.value.toUpperCase())}
                maxLength={18}
              />
            </Field>
            <Field label="RFC">
              <Input
                value={form.rfc}
                onChange={(e) => set('rfc', e.target.value.toUpperCase())}
                maxLength={13}
              />
            </Field>
            <Field label="NSS">
              <Input value={form.nss} onChange={(e) => set('nss', e.target.value)} maxLength={11} />
            </Field>
            <Field label="Número de credencial INE">
              <Input
                value={form.numero_credencial_ine}
                onChange={(e) => set('numero_credencial_ine', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Fecha de nacimiento">
              <Input
                type="date"
                value={form.fecha_nacimiento}
                onChange={(e) => set('fecha_nacimiento', e.target.value)}
              />
            </Field>
            <Field label="Estado civil">
              <Select
                value={form.estado_civil}
                options={ESTADO_CIVIL_OPTIONS}
                onChange={(v) => set('estado_civil', v)}
              />
            </Field>
            <Field label="Nacionalidad">
              <Select
                value={form.nacionalidad}
                options={NACIONALIDAD_OPTIONS}
                onChange={(v) => set('nacionalidad', v)}
              />
            </Field>
            <Field label="Tipo de persona">
              <select
                className={SELECT_CLASS}
                value={form.tipo_persona}
                onChange={(e) => set('tipo_persona', e.target.value)}
              >
                {TIPO_PERSONA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </DetailDrawerSection>

        <DetailDrawerSection title="Contacto">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
            <Field label="Teléfono">
              <Input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
            </Field>
          </div>
        </DetailDrawerSection>

        <DetailDrawerSection
          title="Domicilio"
          description="Al capturar la dirección estructurada, reemplaza el domicilio histórico de Coda en todos los documentos."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Calle">
              <Input
                value={form.domicilio_calle}
                onChange={(e) => set('domicilio_calle', e.target.value)}
              />
            </Field>
            <Field label="Número exterior">
              <Input
                value={form.domicilio_numero_exterior}
                onChange={(e) => set('domicilio_numero_exterior', e.target.value)}
              />
            </Field>
            <Field label="Número interior">
              <Input
                value={form.domicilio_numero_interior}
                onChange={(e) => set('domicilio_numero_interior', e.target.value)}
              />
            </Field>
            <Field label="Colonia">
              <Input
                value={form.domicilio_colonia}
                onChange={(e) => set('domicilio_colonia', e.target.value)}
              />
            </Field>
            <Field label="Código postal">
              <Input
                value={form.domicilio_codigo_postal}
                onChange={(e) => set('domicilio_codigo_postal', e.target.value)}
                maxLength={5}
              />
            </Field>
            <Field label="Ciudad">
              <Input
                value={form.domicilio_ciudad}
                onChange={(e) => set('domicilio_ciudad', e.target.value)}
              />
            </Field>
            <Field label="Estado">
              <Input
                value={form.domicilio_estado}
                onChange={(e) => set('domicilio_estado', e.target.value)}
              />
            </Field>
          </div>
        </DetailDrawerSection>

        <DetailDrawerSection title="KYC / FICU">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Ocupación">
              <Select
                value={form.ocupacion}
                options={OCUPACION_OPTIONS}
                onChange={(v) => set('ocupacion', v)}
              />
            </Field>
            <Field label="Forma de pago">
              <Select
                value={form.forma_pago_kyc}
                options={FORMA_PAGO_OPTIONS}
                onChange={(v) => set('forma_pago_kyc', v)}
              />
            </Field>
            <Field label="Uso de efectivo">
              <Select
                value={form.uso_efectivo_kyc}
                options={USO_EFECTIVO_OPTIONS}
                onChange={(v) => set('uso_efectivo_kyc', v)}
              />
            </Field>
            <Field label="PEP (persona políticamente expuesta)">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.es_pep}
                  onChange={(e) => set('es_pep', e.target.checked)}
                  className="size-4"
                />
                {form.es_pep ? 'Sí' : 'No'}
              </label>
            </Field>
          </div>
        </DetailDrawerSection>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/60">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Select que incluye el valor actual aunque no esté en el catálogo (datos migrados). */
function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select className={SELECT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— sin especificar —</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
