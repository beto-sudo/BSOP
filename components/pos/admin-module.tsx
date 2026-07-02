'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { type Estacion } from './pos-api';

type Operador = {
  id: string;
  empleado_id: string;
  puede_autorizar: boolean;
  activo: boolean;
  nombre: string;
};

type Empleado = { id: string; nombre: string };

/**
 * Admin del POS (rdb.pos.admin — solo administradores, ADR-056): estaciones
 * y operadores con PIN. El PIN se manda a la RPC y se hashea en la DB
 * (bcrypt); el hash jamás viaja de regreso al cliente.
 */
export function PosAdminModule() {
  const toast = useToast();
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [nuevaEstacion, setNuevaEstacion] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<'mostrador' | 'tablet' | 'kds'>('mostrador');
  const [selEmpleado, setSelEmpleado] = useState('');
  const [pin, setPin] = useState('');
  const [autoriza, setAutoriza] = useState(false);

  const refresh = useCallback(async () => {
    const sb = createSupabaseBrowserClient();
    try {
      const [est, ops, emps] = await Promise.all([
        sb
          .schema('rdb')
          .from('pos_estaciones')
          .select('id, nombre, tipo, activa')
          .eq('empresa_id', RDB_EMPRESA_ID)
          .order('nombre'),
        sb
          .schema('rdb')
          .from('pos_operadores')
          .select('id, empleado_id, puede_autorizar, activo')
          .eq('empresa_id', RDB_EMPRESA_ID),
        sb
          .schema('erp')
          .from('empleados')
          .select('id, persona_id')
          .eq('empresa_id', RDB_EMPRESA_ID)
          .is('deleted_at', null),
      ]);
      if (est.error) throw est.error;
      if (ops.error) throw ops.error;
      if (emps.error) throw emps.error;

      const personaIds = (emps.data ?? []).map((e) => e.persona_id);
      const nombres = new Map<string, string>();
      if (personaIds.length > 0) {
        const { data: personas } = await sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno')
          .in('id', personaIds);
        for (const p of personas ?? []) {
          nombres.set(p.id, [p.nombre, p.apellido_paterno].filter(Boolean).join(' '));
        }
      }
      const empleadosConNombre = (emps.data ?? [])
        .map((e) => ({ id: e.id, nombre: nombres.get(e.persona_id) ?? e.id.slice(0, 8) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      const nombreByEmpleado = new Map(empleadosConNombre.map((e) => [e.id, e.nombre]));

      setEstaciones((est.data ?? []) as Estacion[]);
      setOperadores(
        (ops.data ?? []).map((o) => ({
          ...o,
          nombre: nombreByEmpleado.get(o.empleado_id) ?? o.empleado_id.slice(0, 8),
        }))
      );
      setEmpleados(empleadosConNombre);
      setError(null);
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al cargar configuración'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function crearEstacion() {
    if (!nuevaEstacion.trim()) return;
    try {
      const { error: err } = await createSupabaseBrowserClient()
        .schema('rdb')
        .rpc('fn_pos_admin_upsert_estacion', {
          p_empresa_id: RDB_EMPRESA_ID,
          p_nombre: nuevaEstacion.trim(),
          p_tipo: nuevoTipo,
        });
      if (err) throw err;
      setNuevaEstacion('');
      await refresh();
      toast.add({ title: 'Estación creada' });
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al crear estación'));
    }
  }

  async function toggleEstacion(e: Estacion) {
    try {
      const { error: err } = await createSupabaseBrowserClient()
        .schema('rdb')
        .rpc('fn_pos_admin_upsert_estacion', {
          p_empresa_id: RDB_EMPRESA_ID,
          p_nombre: e.nombre,
          p_tipo: e.tipo,
          p_activa: !e.activa,
          p_id: e.id,
        });
      if (err) throw err;
      await refresh();
    } catch (err) {
      setError(getSupabaseErrorMessage(err, 'Error al actualizar estación'));
    }
  }

  async function guardarOperador() {
    if (!selEmpleado || !/^\d{4,6}$/.test(pin)) {
      setError('Elige empleado y un PIN de 4 a 6 dígitos.');
      return;
    }
    try {
      const { error: err } = await createSupabaseBrowserClient()
        .schema('rdb')
        .rpc('fn_pos_admin_guardar_operador', {
          p_empleado_id: selEmpleado,
          p_puede_autorizar: autoriza,
          p_activo: true,
          p_pin: pin,
        });
      if (err) throw err;
      setSelEmpleado('');
      setPin('');
      setAutoriza(false);
      await refresh();
      toast.add({ title: 'Operador guardado' });
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al guardar operador'));
    }
  }

  async function toggleOperador(o: Operador, campo: 'activo' | 'puede_autorizar') {
    try {
      const { error: err } = await createSupabaseBrowserClient()
        .schema('rdb')
        .rpc('fn_pos_admin_guardar_operador', {
          p_empleado_id: o.empleado_id,
          p_puede_autorizar: campo === 'puede_autorizar' ? !o.puede_autorizar : o.puede_autorizar,
          p_activo: campo === 'activo' ? !o.activo : o.activo,
        });
      if (err) throw err;
      await refresh();
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al actualizar operador'));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {error && (
        <div className="lg:col-span-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-medium">Estaciones</h3>
        <ul className="divide-y text-sm">
          {estaciones.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span>
                {e.nombre} <Badge variant="secondary">{e.tipo}</Badge>
              </span>
              <Button size="sm" variant="ghost" onClick={() => toggleEstacion(e)}>
                {e.activa ? 'Desactivar' : 'Activar'}
              </Button>
            </li>
          ))}
          {estaciones.length === 0 && (
            <li className="py-2 text-muted-foreground">Sin estaciones aún.</li>
          )}
        </ul>
        <div className="flex gap-2">
          <Input
            placeholder="Nombre (Tiendita, Tablet Pádel…)"
            value={nuevaEstacion}
            onChange={(e) => setNuevaEstacion(e.target.value)}
          />
          <select
            className="rounded-md border bg-background px-2 text-sm"
            value={nuevoTipo}
            onChange={(e) => setNuevoTipo(e.target.value as typeof nuevoTipo)}
          >
            <option value="mostrador">mostrador</option>
            <option value="tablet">tablet</option>
            <option value="kds">kds</option>
          </select>
          <Button onClick={crearEstacion}>Crear</Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-medium">Operadores (PIN)</h3>
        <ul className="divide-y text-sm">
          {operadores.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2">
              <span className={o.activo ? '' : 'text-muted-foreground line-through'}>
                {o.nombre}
                {o.puede_autorizar && (
                  <Badge className="ml-2" variant="secondary">
                    autorizador
                  </Badge>
                )}
              </span>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleOperador(o, 'puede_autorizar')}
                >
                  {o.puede_autorizar ? 'Quitar autorizador' : 'Hacer autorizador'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleOperador(o, 'activo')}>
                  {o.activo ? 'Desactivar' : 'Activar'}
                </Button>
              </span>
            </li>
          ))}
          {operadores.length === 0 && (
            <li className="py-2 text-muted-foreground">Sin operadores aún.</li>
          )}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto_auto]">
          <select
            className="rounded-md border bg-background px-2 py-2 text-sm"
            value={selEmpleado}
            onChange={(e) => setSelEmpleado(e.target.value)}
          >
            <option value="">Empleado…</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <Input
            placeholder="PIN (4-6)"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={autoriza}
              onChange={(e) => setAutoriza(e.target.checked)}
            />
            autoriza
          </label>
          <Button onClick={guardarOperador}>Guardar</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Guardar sobre un operador existente cambia su PIN. El PIN se hashea en la base — nadie
          puede leerlo después.
        </p>
      </section>
    </div>
  );
}
