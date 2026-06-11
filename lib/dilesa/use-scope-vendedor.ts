'use client';

/**
 * Hook: ¿el usuario actual está scoped a "solo sus ventas" en DILESA?
 *
 * Carga los roles del usuario en DILESA (core.usuarios_empresas → core.roles)
 * y aplica `esSoloVendedor`. Admin global (core.usuarios.rol='admin') nunca
 * queda scoped. Devuelve también el userId para armar los filtros
 * (`vendedor_usuario_id = userId`).
 */

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { esSoloVendedor } from './scope-vendedor';

export type ScopeVendedor = {
  loading: boolean;
  /** true → filtrar lista/clientes y bloquear detalles ajenos. */
  soloVendedor: boolean;
  userId: string | null;
};

export function useScopeVendedorDilesa(): ScopeVendedor {
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<ScopeVendedor>({
    loading: true,
    soloVendedor: false,
    userId: null,
  });

  useEffect(() => {
    let activo = true;
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        if (activo) setState({ loading: false, soloVendedor: false, userId: null });
        return;
      }

      // Admin global → sin scope (política: admin nunca bloqueado).
      const { data: coreUser } = await sb
        .schema('core')
        .from('usuarios')
        .select('id, rol')
        .eq('id', user.id)
        .maybeSingle();
      if (coreUser?.rol === 'admin') {
        if (activo) setState({ loading: false, soloVendedor: false, userId: user.id });
        return;
      }

      const { data: empresa } = await sb
        .schema('core')
        .from('empresas')
        .select('id')
        .eq('slug', 'dilesa')
        .maybeSingle();
      if (!empresa) {
        if (activo) setState({ loading: false, soloVendedor: false, userId: user.id });
        return;
      }

      const { data: ues } = await sb
        .schema('core')
        .from('usuarios_empresas')
        .select('rol_id')
        .eq('usuario_id', user.id)
        .eq('empresa_id', empresa.id)
        .eq('activo', true);
      const rolIds = (ues ?? []).map((u) => u.rol_id).filter((x): x is string => !!x);

      let roles: string[] = [];
      if (rolIds.length > 0) {
        const { data: rolesRows } = await sb
          .schema('core')
          .from('roles')
          .select('nombre')
          .in('id', rolIds);
        roles = ((rolesRows ?? []) as { nombre: string }[]).map((r) => r.nombre);
      }

      if (activo) {
        setState({ loading: false, soloVendedor: esSoloVendedor(roles), userId: user.id });
      }
    })();
    return () => {
      activo = false;
    };
  }, [sb]);

  return state;
}
