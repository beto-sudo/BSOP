/**
 * Copiloto de cierre (S4 dilesa-ventas-expediente) — el motor puro que
 * responde "¿qué falta para terminar la operación?" en lenguaje claro.
 *
 * 4 condiciones para Operación Terminada (F17):
 *   1. Fases 1-16 cerradas.
 *   2. Expediente documental completo (roles requeridos de FASE_ROLES,
 *      descontando los opcionales que la venta no amerita — ver
 *      `rolesOpcionales`).
 *   3. Cuadratura cubierta (saldo del cliente ≤ 0 contra Valor de
 *      Escrituración).
 *   4. Conformidad del cliente registrada (la propia Fase 16 — la encuesta
 *      respondida/capturada/sin-respuesta la cierra).
 *
 * La UI (componente CopilotoCierre + página F17) solo renderiza lo que este
 * motor decide.
 */

export type CopilotoFase = {
  pos: number;
  nombre: string;
  alcanzada: boolean;
};

export type CopilotoDocFaltante = {
  fase: string;
  rol: string;
  label: string;
};

export type CopilotoInput = {
  /** Las 17 fases en orden con su estado. */
  fases: CopilotoFase[];
  /** Docs requeridos que aún no están cargados (ya filtrados de opcionales). */
  docsFaltantes: CopilotoDocFaltante[];
  /** Saldo del cliente (Valor Escrituración − disponible). null = sin datos. */
  saldoCliente: number | null;
  /** Cuadratura cubierta (saldo ≤ 0). null = sin datos para evaluar. */
  cubierta: boolean | null;
};

export type CopilotoItem = {
  ok: boolean;
  label: string;
  detalle: string | null;
};

export type CopilotoResultado = {
  items: CopilotoItem[];
  listo: boolean;
  pendientes: number;
};

export function evaluarCierre(
  i: CopilotoInput,
  fmtMoney?: (n: number) => string
): CopilotoResultado {
  const money = fmtMoney ?? ((n: number) => `$${n.toLocaleString('es-MX')}`);

  const fasesPendientes = i.fases.filter((f) => f.pos <= 16 && !f.alcanzada);
  const itemFases: CopilotoItem = {
    ok: fasesPendientes.length === 0,
    label: 'Pipeline completo (fases 1-16)',
    detalle:
      fasesPendientes.length === 0
        ? null
        : `Faltan: ${fasesPendientes.map((f) => `${f.pos} · ${f.nombre}`).join(', ')}`,
  };

  const itemDocs: CopilotoItem = {
    ok: i.docsFaltantes.length === 0,
    label: 'Expediente documental completo',
    detalle:
      i.docsFaltantes.length === 0
        ? null
        : `Faltan ${i.docsFaltantes.length}: ${i.docsFaltantes.map((d) => d.label).join(', ')}`,
  };

  const itemCuadratura: CopilotoItem = {
    ok: i.cubierta === true,
    label: 'Cuadratura cubierta',
    detalle:
      i.cubierta === true
        ? null
        : i.cubierta === null || i.saldoCliente == null
          ? 'Sin datos suficientes (falta valor de escrituración o depósitos).'
          : `Saldo del cliente: ${money(i.saldoCliente)}.`,
  };

  const fase16 = i.fases.find((f) => f.pos === 16);
  const itemConformidad: CopilotoItem = {
    ok: fase16?.alcanzada === true,
    label: 'Conformidad del cliente registrada',
    detalle:
      fase16?.alcanzada === true
        ? null
        : 'La encuesta posventa no se ha respondido ni capturado (Fase 16).',
  };

  const items = [itemFases, itemDocs, itemCuadratura, itemConformidad];
  const pendientes = items.filter((it) => !it.ok).length;
  return { items, listo: pendientes === 0, pendientes };
}
