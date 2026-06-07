/**
 * GET /api/dilesa/construccion/contratos/[id]/pdf
 *
 * Genera el PDF del Contrato de Servicios a Precios Unitarios y Tiempo
 * Determinado (contrato de obra DILESA ↔ contratista). Replica el doc
 * vivo en Coda. Incluye cuerpo + ANEXO 3 (precios unitarios por
 * actividad y prototipo).
 *
 * El precio unitario de cada actividad se DERIVA:
 *   precioMo = porcentaje_costo × valor_contrato_mo(prototipo)
 * porque el costo MO absoluto por actividad no está poblado (ni en BSOP
 * ni en la tabla origen de Coda — solo el % de costo).
 *
 * Auth: sesión Supabase + RLS de dilesa. El botón en el detalle ya está
 * gated por el sub-slug `dilesa.construccion.contratos`.
 *
 * Output: application/pdf como attachment (descarga, no inline).
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  ContratoObraPDF,
  type ContratoObraData,
  type ContratoObraLote,
  type Anexo3Prototipo,
  type Anexo3Tarea,
} from '@/lib/dilesa/pdf/contrato-obra';
import {
  ContratoObraGlobalPDF,
  type ContratoObraGlobalData,
} from '@/lib/dilesa/pdf/contrato-obra-global';
import { formatMontoEnLetras } from '@/lib/format/numero-a-letras';

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Columnas `date` (YYYY-MM-DD) sin TZ — parsear los componentes directo evita shifts. */
function fechaLarga(s: string | null): string {
  if (!s) return '__________';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const [, y, mo, d] = m;
  const mesIdx = Math.max(0, Math.min(11, Number(mo) - 1));
  return `${Number(d)} de ${MESES_ES[mesIdx]} del ${y}`;
}
function fechaCorta(s: string | null): string {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const [, y, mo, d] = m;
  return `${Number(d)}/${Number(mo)}/${y}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();

  // 1. Contrato
  const { data: contrato, error: cErr } = await sb
    .schema('dilesa')
    .from('contratos_construccion')
    .select(
      'id, codigo, fecha_contrato, contratista_id, proyecto_id, valor_total, tipo, objeto, fecha_inicio, fecha_fin, anticipo_pct, retencion_pct, fianza_pct, periodicidad_estimaciones_dias'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (cErr || !contrato) {
    return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
  }

  // 2. Contratista (persona + datos satélite) y 3. proyecto y 4. lotes — en paralelo
  const [{ data: persona }, { data: datos }, { data: proyecto }, { data: lotesRows }] =
    await Promise.all([
      sb
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, rfc')
        .eq('id', contrato.contratista_id)
        .maybeSingle(),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('persona_fisica_o_moral, representante_legal, repse, registro_patronal, domicilio')
        .eq('persona_id', contrato.contratista_id)
        .maybeSingle(),
      contrato.proyecto_id
        ? sb
            .schema('dilesa')
            .from('proyectos')
            .select('nombre')
            .eq('id', contrato.proyecto_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sb
        .schema('dilesa')
        .from('contrato_lotes')
        .select('construccion_id, monto_lote')
        .eq('contrato_id', contrato.id)
        .is('deleted_at', null),
    ]);

  // ── Branch: contrato de obra de MONTO GLOBAL (no-vivienda) ──
  // La vivienda se describe por lotes/prototipos + ANEXO 3 de precios unitarios;
  // la obra (urbanización, cabecera, tarea menor) por su objeto descriptivo, sin
  // lotes ni anexos. Genérico para los 3 tipos no-vivienda.
  if ((contrato.tipo as string) !== 'vivienda') {
    const nombreCtr =
      [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
        .filter(Boolean)
        .join(' ')
        .trim() || '(sin nombre)';
    const esMoralG = /moral/i.test((datos?.persona_fisica_o_moral as string | null) ?? '');
    const monto = Number(contrato.valor_total ?? 0);
    const anticipoPct = Number(contrato.anticipo_pct ?? 0);
    const anticipoMonto = Math.round(monto * anticipoPct) / 100; // pct sobre el total
    const globalData: ContratoObraGlobalData = {
      folio: (contrato.codigo as string) ?? id,
      fechaFirmaTexto: fechaLarga(contrato.fecha_contrato as string | null),
      fechaInicioTexto: fechaLarga(
        (contrato.fecha_inicio as string | null) ?? (contrato.fecha_contrato as string | null)
      ),
      fechaFinTexto: fechaLarga(contrato.fecha_fin as string | null),
      objeto: (contrato.objeto as string | null) ?? '',
      proyectoNombre: (proyecto?.nombre as string | null) ?? '',
      contratista: {
        nombre: nombreCtr.toUpperCase(),
        esMoral: esMoralG,
        representanteLegal: (datos?.representante_legal as string | null) || null,
        rfc: (persona?.rfc as string | null) || null,
        repse: (datos?.repse as string | null) || null,
        registroPatronal: (datos?.registro_patronal as string | null) || null,
        domicilio: (datos?.domicilio as string | null) || null,
      },
      montoTotal: monto,
      montoTotalEnLetra: formatMontoEnLetras(monto),
      anticipoMonto,
      anticipoEnLetra: formatMontoEnLetras(anticipoMonto),
      anticipoPct,
      retencionPct: Number(contrato.retencion_pct ?? 0),
      fianzaPct: Number(contrato.fianza_pct ?? 0),
      periodicidadDias: Number(contrato.periodicidad_estimaciones_dias ?? 14),
    };
    const bufG = await renderToBuffer(<ContratoObraGlobalPDF data={globalData} />);
    const fnameG = `contrato-obra-${(contrato.codigo as string)?.replace(/[^\w.-]+/g, '_') || id}.pdf`;
    return new Response(new Uint8Array(bufG), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fnameG}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const construccionIds = [...new Set((lotesRows ?? []).map((l) => l.construccion_id as string))];
  if (construccionIds.length === 0) {
    return NextResponse.json(
      { error: 'El contrato no tiene lotes asignados — no se puede generar el contrato.' },
      { status: 400 }
    );
  }

  // 5. Construcciones (lotes)
  const { data: obras } = await sb
    .schema('dilesa')
    .from('construccion')
    .select(
      'id, codigo, producto_id, precio_mo_x_m2, m2_construccion, valor_contrato_mo, fecha_compromiso_terminar'
    )
    .in('id', construccionIds);
  const obrasArr = obras ?? [];

  // 6. Productos (prototipos)
  const productoIds = [...new Set(obrasArr.map((o) => o.producto_id as string))];
  const { data: productos } = await sb
    .schema('dilesa')
    .from('productos')
    .select('id, nombre')
    .in('id', productoIds);
  const productoNombre = new Map<string, string>();
  for (const p of productos ?? []) productoNombre.set(p.id as string, p.nombre as string);

  // Lotes (cláusula PRIMERA), ordenados por código
  const proyectoNombre = (proyecto?.nombre as string | null) ?? '';
  const lotes: ContratoObraLote[] = obrasArr
    .map((o) => {
      const precioMoM2 = Number(o.precio_mo_x_m2 ?? 0);
      const m2 = Number(o.m2_construccion ?? 0);
      const valorMo = Number(o.valor_contrato_mo ?? precioMoM2 * m2);
      return {
        codigo: (o.codigo as string) ?? '',
        proyecto: proyectoNombre,
        prototipo: productoNombre.get(o.producto_id as string) ?? '',
        precioMoM2,
        m2,
        valorMo,
        fechaCompromisoTexto: fechaCorta(o.fecha_compromiso_terminar as string | null),
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));

  const montoTotal =
    Number(contrato.valor_total ?? 0) || lotes.reduce((sum, l) => sum + l.valorMo, 0);

  // Fecha fin = máxima fecha compromiso de los lotes (orden lexicográfico = cronológico en YYYY-MM-DD)
  const fechasCompromiso = obrasArr
    .map((o) => o.fecha_compromiso_terminar as string | null)
    .filter((s): s is string => !!s)
    .sort();
  const fechaFinYMD = fechasCompromiso.length
    ? fechasCompromiso[fechasCompromiso.length - 1]
    : null;

  // 7. ANEXO 3 — plantilla de tareas por prototipo + lookups de etapa/tarea
  const { data: plantilla } = await sb
    .schema('dilesa')
    .from('plantilla_tareas')
    .select('producto_id, tarea_id, etapa_id, porcentaje_costo, tiempo_dias')
    .in('producto_id', productoIds)
    .is('deleted_at', null);
  const plantillaArr = plantilla ?? [];

  const tareaIds = [...new Set(plantillaArr.map((r) => r.tarea_id as string))];
  const etapaIds = [...new Set(plantillaArr.map((r) => r.etapa_id as string))];
  const [{ data: tareas }, { data: etapas }] = await Promise.all([
    tareaIds.length
      ? sb.schema('dilesa').from('tareas_construccion').select('id, nombre').in('id', tareaIds)
      : Promise.resolve({ data: [] }),
    etapaIds.length
      ? sb
          .schema('dilesa')
          .from('etapas_construccion')
          .select('id, nombre, orden')
          .in('id', etapaIds)
      : Promise.resolve({ data: [] }),
  ]);
  const tareaNombre = new Map<string, string>();
  for (const t of tareas ?? []) tareaNombre.set(t.id as string, t.nombre as string);
  const etapaInfo = new Map<string, { nombre: string; orden: number }>();
  for (const e of etapas ?? [])
    etapaInfo.set(e.id as string, { nombre: e.nombre as string, orden: Number(e.orden ?? 0) });

  // valor MO por prototipo = valor_contrato_mo de un lote representativo de ese prototipo
  const valorMoPorProducto = new Map<string, number>();
  for (const o of obrasArr) {
    const pid = o.producto_id as string;
    if (!valorMoPorProducto.has(pid)) {
      const v =
        Number(o.valor_contrato_mo ?? 0) ||
        Number(o.precio_mo_x_m2 ?? 0) * Number(o.m2_construccion ?? 0);
      valorMoPorProducto.set(pid, v);
    }
  }

  const anexo3: Anexo3Prototipo[] = productoIds.map((pid) => {
    const valorMo = valorMoPorProducto.get(pid) ?? 0;
    const ordenadas = plantillaArr
      .filter((r) => r.producto_id === pid)
      .map((r) => {
        const etapa = etapaInfo.get(r.etapa_id as string) ?? { nombre: '', orden: 0 };
        const porcentaje = Number(r.porcentaje_costo ?? 0);
        return {
          etapa: etapa.nombre,
          orden: etapa.orden,
          tarea: tareaNombre.get(r.tarea_id as string) ?? '',
          porcentaje,
          precioMo: porcentaje * valorMo,
          dias: Number(r.tiempo_dias ?? 0),
        };
      })
      .sort((a, b) => a.orden - b.orden || a.tarea.localeCompare(b.tarea, 'es'));
    const tareas: Anexo3Tarea[] = ordenadas.map((t) => ({
      etapa: t.etapa,
      tarea: t.tarea,
      porcentaje: t.porcentaje,
      precioMo: t.precioMo,
      dias: t.dias,
    }));
    return { prototipo: productoNombre.get(pid) ?? '', valorMo, tareas };
  });

  // Nombre del contratista
  const nombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim() || '(sin nombre)';
  const esMoral = /moral/i.test((datos?.persona_fisica_o_moral as string | null) ?? '');

  const data: ContratoObraData = {
    folio: (contrato.codigo as string) ?? id,
    fechaFirmaTexto: fechaLarga(contrato.fecha_contrato as string | null),
    fechaInicioTexto: fechaLarga(contrato.fecha_contrato as string | null),
    fechaFinTexto: fechaLarga(fechaFinYMD),
    contratista: {
      nombre: nombre.toUpperCase(),
      esMoral,
      representanteLegal: (datos?.representante_legal as string | null) || null,
      rfc: (persona?.rfc as string | null) || null,
      repse: (datos?.repse as string | null) || null,
      registroPatronal: (datos?.registro_patronal as string | null) || null,
      domicilio: (datos?.domicilio as string | null) || null,
    },
    lotes,
    montoTotal,
    montoTotalEnLetra: formatMontoEnLetras(montoTotal),
    anexo3,
  };

  const buf = await renderToBuffer(<ContratoObraPDF data={data} />);
  const filename = `contrato-obra-${(contrato.codigo as string)?.replace(/[^\w.-]+/g, '_') || id}.pdf`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const runtime = 'nodejs';
