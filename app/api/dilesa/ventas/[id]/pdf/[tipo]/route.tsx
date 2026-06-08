/**
 * GET /api/dilesa/ventas/[id]/pdf/[tipo]
 *
 * Genera un PDF del expediente para una venta DILESA. Sprint 7b.
 *
 * Tipos soportados:
 *   - solicitud-asignacion
 *   - aviso-privacidad
 *   - ficu
 *   - promesa-compraventa
 *
 * Auth: la sesión de Supabase. La RLS de `dilesa.ventas` decide si el
 * usuario puede leerla — vendedor solo sus propias ventas; otros roles
 * todas. Si la venta no se ve (RLS), devolvemos 404.
 *
 * Output: application/pdf con Content-Disposition `attachment` para que
 * el browser descargue (no inline) — el vendedor debe imprimir físico.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { SolicitudAsignacionPDF, type SolicitudData } from '@/lib/dilesa/pdf/solicitud-asignacion';
import { AvisoPrivacidadPDF, type AvisoPrivacidadData } from '@/lib/dilesa/pdf/aviso-privacidad';
import { FicuPDF, type FicuData } from '@/lib/dilesa/pdf/ficu';
import { PromesaCompraventaPDF, type PromesaData } from '@/lib/dilesa/pdf/promesa-compraventa';
import { SolicitudAvaluoPDF, type SolicitudAvaluoData } from '@/lib/dilesa/pdf/solicitud-avaluo';
import {
  SolicitudDictamenPDF,
  type SolicitudDictamenData,
} from '@/lib/dilesa/pdf/solicitud-dictamen';
import { PolizaGarantiaPDF, type PolizaGarantiaData } from '@/lib/dilesa/pdf/poliza-garantia';
import {
  PagareCreditoDirectoPDF,
  type PagareCreditoDirectoData,
} from '@/lib/dilesa/pdf/pagare-credito-directo';
import { evaluarRiesgo } from '@/lib/dilesa/ficu/riesgo';
import { formatMontoEnLetras } from '@/lib/format/numero-a-letras';
import { loadGerenteVentas } from '@/lib/dilesa/gerente-ventas';

const TIPOS = [
  'solicitud-asignacion',
  'aviso-privacidad',
  'ficu',
  'promesa-compraventa',
  'solicitud-avaluo',
  'solicitud-dictamen',
  'poliza-garantia',
  'pagare-credito-directo',
] as const;
type TipoPdf = (typeof TIPOS)[number];

const moneyFmtPdf = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const moneyPdf = (n: number | null | undefined): string | null =>
  n == null || Number(n) <= 0 ? null : moneyFmtPdf.format(Number(n));

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; tipo: string }> }
) {
  const { id, tipo } = await params;

  if (!TIPOS.includes(tipo as TipoPdf)) {
    return NextResponse.json({ error: 'Tipo de PDF desconocido' }, { status: 400 });
  }

  const sb = await createSupabaseServerClient();

  // Venta + relaciones cross-schema. RLS filtra automáticamente.
  // `ine_numero` se preserva en venta porque es per-venta (la INE específica
  // que presentó el comprador en este expediente). Los demás KYC fields
  // (forma_pago, uso_efectivo, ocupacion, es_pep, conocimiento_dueno_beneficiario)
  // viven en erp.personas y se leen desde ahí (Sprint 7c-2 los puso ahí).
  const { data: venta, error: vErr } = await sb
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, persona_id, unidad_id, vendedor_usuario_id, tipo_credito, vendedor, monto_credito_titular, monto_credito_cotitular, productos_adicionales, precio_asignacion, created_at, ine_numero, estado, valuador_id, notario_id'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (vErr || !venta) {
    return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
  }

  // Si la venta ya no está activa (desasignada o expirada), estampamos
  // un watermark en el PDF para invalidarlo visualmente. LFPIORPI exige
  // conservar el expediente histórico, por eso no escondemos el botón;
  // marcamos el doc para que nadie lo use como válido por error.
  const watermarkText: string | null =
    venta.estado === 'desasignada'
      ? 'DESASIGNADA'
      : venta.estado === 'expirada'
        ? 'EXPIRADA'
        : null;

  // Persona (cliente) cross-schema — FICU + Promesa necesitan todos los KYC
  // fields que el form de Sprint 7c-2 persistió aquí (no en `dilesa.ventas`).
  const { data: persona } = await sb
    .schema('erp')
    .from('personas')
    .select(
      'nombre, apellido_paterno, apellido_materno, fecha_nacimiento, curp, rfc, email, telefono, nacionalidad, tipo_persona, domicilio, forma_pago_kyc, uso_efectivo_kyc, ocupacion, conocimiento_dueno_beneficiario, es_pep'
    )
    .eq('id', venta.persona_id)
    .maybeSingle();
  const clienteNombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';

  // Vendedor (asesor de ventas) — el form persiste `vendedor_usuario_id`
  // (FK a core.usuarios); el campo legacy `venta.vendedor` (text) puede
  // estar vacío en ventas nuevas. Resolvemos el nombre completo via lookup.
  // Concatena `first_name + ' ' + last_name`; si falta last_name, queda
  // solo el first_name; si falta first_name, fallback a email; si nada,
  // al campo text legacy de la venta.
  let vendedorNombre = (venta.vendedor ?? '').toString();
  let vendedorEmail: string | null = null;
  if (venta.vendedor_usuario_id) {
    const { data: u } = await sb
      .schema('core')
      .from('usuarios')
      .select('first_name, last_name, email')
      .eq('id', venta.vendedor_usuario_id)
      .maybeSingle();
    const nombreCompleto = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
    if (nombreCompleto) {
      vendedorNombre = nombreCompleto;
    } else if (u?.email && !vendedorNombre) {
      vendedorNombre = u.email;
    }
    vendedorEmail = (u?.email as string | null) ?? null;
  }

  // Unidad + proyecto + producto (todos en dilesa)
  let identificacionInventario = '';
  let pdfDataExtra: Partial<SolicitudData> = {};
  // Datos del inmueble en scope superior para las solicitudes imprimibles
  // (avalúo, dictamen) que los muestran tal cual sin desglose de precio.
  let pdfFraccionamiento: string | null = null;
  let pdfManzana: string | null = null;
  let pdfLote: string | null = null;
  let pdfPrototipo: string | null = null;
  let pdfDomicilioOficial: string | null = null;
  let pdfAreaTerreno: string | null = null;
  let pdfAreaConstruida: string | null = null;
  let pdfCaracteristicas: string | null = null;
  if (venta.unidad_id) {
    const { data: unidad } = await sb
      .schema('dilesa')
      .from('unidades')
      .select(
        'identificador, area_m2, es_esquina, tiene_frente_verde, manzana, numero_lote, calle, numero_oficial, m2_construccion, valor_venta_futuro_snapshot, proyecto_id, producto_id'
      )
      .eq('id', venta.unidad_id)
      .maybeSingle();
    if (unidad) {
      const [{ data: proyecto }, { data: producto }] = await Promise.all([
        sb
          .schema('dilesa')
          .from('proyectos')
          .select('nombre, precio_m2_excedente, tamano_lote_promedio')
          .eq('id', unidad.proyecto_id)
          .maybeSingle(),
        unidad.producto_id
          ? sb
              .schema('dilesa')
              .from('productos')
              .select('nombre')
              .eq('id', unidad.producto_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const protoSufijo = producto?.nombre ? producto.nombre.split('-').pop() : '';
      identificacionInventario = protoSufijo
        ? `${unidad.identificador}-${protoSufijo}`
        : unidad.identificador;

      pdfDataExtra = {
        fraccionamiento: (proyecto?.nombre ?? '').toUpperCase(),
        manzana: unidad.manzana ?? '',
        lote: unidad.numero_lote ?? '',
        prototipo: producto?.nombre ?? '',
        domicilioOficial: [unidad.calle, unidad.numero_oficial]
          .filter(Boolean)
          .join(' #')
          .toUpperCase(),
        identificacionInventario,
        terrenoExcedente: Math.max(
          0,
          (unidad.area_m2 ?? 0) - (proyecto?.tamano_lote_promedio ?? 0)
        ),
        frenteVerde: unidad.tiene_frente_verde ?? false,
        esquina: unidad.es_esquina ?? false,
        precioM2Excedente: Number(proyecto?.precio_m2_excedente ?? 0),
      };

      // Datos para las solicitudes imprimibles (avalúo, dictamen).
      pdfFraccionamiento = proyecto?.nombre ?? null;
      pdfManzana = unidad.manzana ?? null;
      pdfLote = unidad.numero_lote ?? null;
      pdfPrototipo = protoSufijo || null;
      pdfDomicilioOficial =
        [unidad.calle, unidad.numero_oficial].filter(Boolean).join(' #') || null;
      pdfAreaTerreno = unidad.area_m2 != null ? `${Number(unidad.area_m2).toFixed(2)} m²` : null;
      pdfAreaConstruida =
        unidad.m2_construccion != null ? `${Number(unidad.m2_construccion).toFixed(2)} m²` : null;
      const carac: string[] = [];
      if (unidad.es_esquina) carac.push('Esquina');
      if (unidad.tiene_frente_verde) carac.push('Frente verde');
      pdfCaracteristicas = carac.length > 0 ? carac.join(' · ') : null;
    }
  }

  const fechaCreado = new Date(venta.created_at);
  const fechaTexto = fechaCreado.toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Para las solicitudes (avalúo/dictamen) el contacto es el Gerente de
  // Ventas (Edgar en DILESA), no el asesor que capturó la venta. Mismo
  // criterio que los emails. Solo se resuelve para esos 2 tipos.
  const gerente =
    tipo === 'solicitud-avaluo' || tipo === 'solicitud-dictamen'
      ? await loadGerenteVentas(sb, venta.empresa_id)
      : null;
  const contactoNombre = gerente?.nombre ?? (vendedorNombre || null);
  const contactoEmail = gerente?.email ?? vendedorEmail;

  if (tipo === 'solicitud-avaluo') {
    let valuadorNombre = '(casa valuadora)';
    if (venta.valuador_id) {
      const { data: val } = await sb
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno')
        .eq('id', venta.valuador_id)
        .maybeSingle();
      valuadorNombre =
        [val?.nombre, val?.apellido_paterno, val?.apellido_materno]
          .filter(Boolean)
          .join(' ')
          .trim() || valuadorNombre;
    }
    const data: SolicitudAvaluoData = {
      fechaTexto,
      valuadorNombre,
      fraccionamiento: pdfFraccionamiento,
      manzana: pdfManzana,
      lote: pdfLote,
      prototipo: pdfPrototipo,
      identificacionInventario,
      domicilioOficial: pdfDomicilioOficial,
      areaTerreno: pdfAreaTerreno,
      areaConstruida: pdfAreaConstruida,
      caracteristicas: pdfCaracteristicas,
      clienteNombre,
      clienteCurp: persona?.curp ?? null,
      clienteTelefono: persona?.telefono ?? null,
      vendedorNombre: contactoNombre,
      vendedorEmail: contactoEmail,
    };
    const buf = await renderToBuffer(<SolicitudAvaluoPDF data={data} />);
    return pdfResponse(buf, `solicitud-avaluo-${identificacionInventario || id}.pdf`);
  }

  if (tipo === 'solicitud-dictamen') {
    let notarioNombre = '(notaría)';
    if (venta.notario_id) {
      const { data: not } = await sb
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno')
        .eq('id', venta.notario_id)
        .maybeSingle();
      notarioNombre =
        [not?.nombre, not?.apellido_paterno, not?.apellido_materno]
          .filter(Boolean)
          .join(' ')
          .trim() || notarioNombre;
    }
    const data: SolicitudDictamenData = {
      fechaTexto,
      notarioNombre,
      fraccionamiento: pdfFraccionamiento,
      manzana: pdfManzana,
      lote: pdfLote,
      prototipo: pdfPrototipo,
      identificacionInventario,
      domicilioOficial: pdfDomicilioOficial,
      areaTerreno: pdfAreaTerreno,
      areaConstruida: pdfAreaConstruida,
      clienteNombre,
      clienteCurp: persona?.curp ?? null,
      clienteTelefono: persona?.telefono ?? null,
      tipoCredito: venta.tipo_credito ?? null,
      precioVenta: moneyPdf(venta.precio_asignacion),
      montoCreditoTitular: moneyPdf(venta.monto_credito_titular),
      montoCreditoCotitular: moneyPdf(venta.monto_credito_cotitular),
      vendedorNombre: contactoNombre,
      vendedorEmail: contactoEmail,
    };
    const buf = await renderToBuffer(<SolicitudDictamenPDF data={data} />);
    return pdfResponse(buf, `solicitud-dictamen-${identificacionInventario || id}.pdf`);
  }

  if (tipo === 'poliza-garantia') {
    // Datos del desarrollador (core.empresas). registro_infonavit/telefono/
    // email_contacto son columnas nuevas (Sprint 7h) — casteamos el row para
    // no depender de la regen de types antes del typecheck local.
    const { data: empRow } = await sb
      .schema('core')
      .from('empresas')
      .select(
        'razon_social, nombre, representante_legal, firmante_poliza, registro_infonavit, telefono, email_contacto'
      )
      .eq('id', venta.empresa_id)
      .maybeSingle();
    const empresa = (empRow ?? null) as {
      razon_social: string | null;
      nombre: string | null;
      representante_legal: string | null;
      firmante_poliza: string | null;
      registro_infonavit: string | null;
      telefono: string | null;
      email_contacto: string | null;
    } | null;
    const razonSocial = (empresa?.razon_social || empresa?.nombre || 'DILESA').toUpperCase();
    // Fecha de expedición = hoy (la póliza se expide al imprimirla para el notario).
    const fechaExpedicion = new Date().toLocaleDateString('es-MX', {
      timeZone: 'America/Matamoros',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const data: PolizaGarantiaData = {
      fechaTexto: fechaExpedicion,
      desarrolladorRazonSocial: razonSocial,
      registroInfonavit: empresa?.registro_infonavit ?? null,
      // La póliza la firma `firmante_poliza` (Adalberto en DILESA); cae a
      // representante_legal (administrativo/fiscal) si no hay firmante propio.
      representanteLegal: empresa?.firmante_poliza ?? empresa?.representante_legal ?? null,
      telefono: empresa?.telefono ?? null,
      email: empresa?.email_contacto ?? null,
      clienteNombre,
      identificacionInventario,
      fraccionamiento: pdfFraccionamiento ? pdfFraccionamiento.toUpperCase() : null,
      manzana: pdfManzana,
      lote: pdfLote,
      prototipo: pdfPrototipo,
      domicilioOficial: pdfDomicilioOficial ? pdfDomicilioOficial.toUpperCase() : null,
      watermark: watermarkText,
    };
    const buf = await renderToBuffer(<PolizaGarantiaPDF data={data} />);
    return pdfResponse(buf, `poliza-garantia-${identificacionInventario || id}.pdf`);
  }

  if (tipo === 'pagare-credito-directo') {
    // Campos del crédito directo (Sprint 7h PR2) — casteo el row (columnas
    // nuevas, no dependo de la regen de types antes del typecheck local).
    const { data: cdRow } = await sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'monto_credito_directo, cd_plan_pagos, cd_tiie28_pct, cd_spread_moratorio_pct, cd_interes_ordinario_pct, cd_fecha_suscripcion, cd_aval_nombre, cd_aval_domicilio'
      )
      .eq('id', id)
      .maybeSingle();
    const cd = (cdRow ?? null) as {
      monto_credito_directo: number | null;
      cd_plan_pagos: Array<{ num?: number; fecha?: string; monto?: number }> | null;
      cd_tiie28_pct: number | null;
      cd_spread_moratorio_pct: number | null;
      cd_interes_ordinario_pct: number | null;
      cd_fecha_suscripcion: string | null;
      cd_aval_nombre: string | null;
      cd_aval_domicilio: string | null;
    } | null;
    const montoTotal = Number(cd?.monto_credito_directo ?? 0);
    if (!cd || montoTotal <= 0) {
      return NextResponse.json(
        { error: 'La venta no tiene crédito directo configurado.' },
        { status: 400 }
      );
    }

    const money2 = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const fmtFechaLarga = (iso: string | null): string => {
      if (!iso) return '—';
      const [y, m, d] = iso.split('-').map(Number);
      if (!y || !m || !d) return iso;
      return `${d} de ${(MESES_ES[m - 1] ?? '').toLowerCase()} de ${y}`;
    };

    // Empresa (beneficiario del pagaré).
    const { data: empRow2 } = await sb
      .schema('core')
      .from('empresas')
      .select(
        'razon_social, nombre, domicilio_calle, domicilio_numero_ext, domicilio_colonia, domicilio_municipio, domicilio_estado'
      )
      .eq('id', venta.empresa_id)
      .maybeSingle();
    const emp = (empRow2 ?? null) as {
      razon_social: string | null;
      nombre: string | null;
      domicilio_calle: string | null;
      domicilio_numero_ext: string | null;
      domicilio_colonia: string | null;
      domicilio_municipio: string | null;
      domicilio_estado: string | null;
    } | null;
    const beneficiario = (emp?.razon_social || emp?.nombre || 'DILESA').toUpperCase();
    const beneficiarioDomicilio =
      [
        [emp?.domicilio_calle, emp?.domicilio_numero_ext].filter(Boolean).join(' '),
        emp?.domicilio_colonia,
        emp?.domicilio_municipio,
        emp?.domicilio_estado,
      ]
        .filter(Boolean)
        .join(', ') || null;
    const lugarSuscripcion =
      [emp?.domicilio_municipio, emp?.domicilio_estado].filter(Boolean).join(', ') ||
      'Piedras Negras, Coahuila';

    const parcialidades = (Array.isArray(cd.cd_plan_pagos) ? cd.cd_plan_pagos : []).map((p, i) => ({
      num: Number(p?.num ?? i + 1),
      fechaTexto: fmtFechaLarga(p?.fecha ?? null),
      montoFmt: money2.format(Number(p?.monto ?? 0)),
    }));

    const tiie = cd.cd_tiie28_pct != null ? Number(cd.cd_tiie28_pct) : null;
    const spread = cd.cd_spread_moratorio_pct != null ? Number(cd.cd_spread_moratorio_pct) : 4;
    const tasaMoratoria = tiie != null ? Math.round((tiie + spread) * 100) / 100 : null;
    const fechaSuscripcion = cd.cd_fecha_suscripcion ?? new Date().toISOString().slice(0, 10);

    const data: PagareCreditoDirectoData = {
      folio: `PG-${identificacionInventario || id}`,
      lugarSuscripcion,
      fechaSuscripcionTexto: fmtFechaLarga(fechaSuscripcion),
      beneficiario,
      beneficiarioDomicilio,
      deudorNombre: clienteNombre,
      deudorDomicilio: (persona?.domicilio as string | null) ?? null,
      deudorIdentificacion: persona?.curp || persona?.rfc || null,
      identificacionInventario,
      fraccionamiento: pdfFraccionamiento,
      domicilioOficial: pdfDomicilioOficial,
      montoTotalFmt: money2.format(montoTotal),
      montoTotalLetra: formatMontoEnLetras(montoTotal),
      parcialidades,
      interesOrdinarioPct:
        cd.cd_interes_ordinario_pct != null ? Number(cd.cd_interes_ordinario_pct) : null,
      tiie28Pct: tiie,
      spreadMoratorioPct: spread,
      tasaMoratoriaPct: tasaMoratoria,
      avalNombre: cd.cd_aval_nombre ?? null,
      avalDomicilio: cd.cd_aval_domicilio ?? null,
      watermark: watermarkText,
    };
    const buf = await renderToBuffer(<PagareCreditoDirectoPDF data={data} />);
    return pdfResponse(buf, `pagare-${identificacionInventario || id}.pdf`);
  }

  if (tipo === 'aviso-privacidad') {
    const data: AvisoPrivacidadData = {
      fechaTexto,
      clienteNombre,
      identificacionInventario,
      watermark: watermarkText,
    };
    const buf = await renderToBuffer(<AvisoPrivacidadPDF data={data} />);
    return pdfResponse(buf, `aviso-privacidad-${identificacionInventario || id}.pdf`);
  }

  if (tipo === 'promesa-compraventa') {
    // Co-titular: si hay monto_credito_cotitular > 0, buscar persona cotitular
    // Por ahora no hay FK explícita persona_cotitular_id en ventas, sólo el ref
    // textual. Se deja el co-titular opcional; en sprint 7c se modela la FK.
    // Si la unidad no se pudo cargar (raro), no podemos generar el contrato.
    if (!venta.unidad_id) {
      return NextResponse.json(
        { error: 'La venta no tiene unidad asignada — no se puede generar el contrato.' },
        { status: 400 }
      );
    }
    const { data: unidadFull } = await sb
      .schema('dilesa')
      .from('unidades')
      .select('manzana, numero_lote, area_m2, proyecto_id, producto_id')
      .eq('id', venta.unidad_id)
      .maybeSingle();
    const [{ data: proyectoFull }, { data: productoFull }] = await Promise.all([
      unidadFull?.proyecto_id
        ? sb
            .schema('dilesa')
            .from('proyectos')
            .select('nombre')
            .eq('id', unidadFull.proyecto_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      unidadFull?.producto_id
        ? sb
            .schema('dilesa')
            .from('productos')
            .select('nombre')
            .eq('id', unidadFull.producto_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // El precio de la operación es el TOTAL de la venta, no la suma de
    // créditos (que omite enganche, gastos notariales y pago directo).
    // Usamos `precio_asignacion` (snapshot persistido del cálculo) y
    // fallback a la suma de créditos solo si no está disponible.
    const precio =
      Number(venta.precio_asignacion ?? 0) ||
      Number(venta.monto_credito_titular ?? 0) + Number(venta.monto_credito_cotitular ?? 0);
    const arras1pct = Math.round(precio * 0.01);
    const arras10pct = Math.round(precio * 0.1);
    const modeloSufijo = productoFull?.nombre ? (productoFull.nombre.split('-').pop() ?? '') : '';

    // La promesa se firma en el momento de la impresión. Toda la fecha
    // del contrato refleja "ahora" en TZ America/Matamoros (Vercel runtime
    // es UTC; sin timeZone explícito la hora salía 5–6 horas adelantada).
    const ahora = new Date();
    const TZ_MX = 'America/Matamoros';
    const fechaTextoPromesa = ahora.toLocaleDateString('es-MX', {
      timeZone: TZ_MX,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    // Componentes individuales del contrato — usamos Intl.DateTimeFormat con
    // TZ explícito porque `getDate()/getMonth()/getFullYear()` retornan
    // siempre en TZ local del runtime (UTC en Vercel), no en TZ Matamoros.
    const partsFmt = new Intl.DateTimeFormat('es-MX', {
      timeZone: TZ_MX,
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    const parts = Object.fromEntries(
      partsFmt.formatToParts(ahora).map((p) => [p.type, p.value])
    ) as Record<string, string>;
    const diaTextoMx = parts.day ?? String(ahora.getUTCDate());
    const mesIdxMx = Math.max(0, Math.min(11, Number(parts.month ?? '1') - 1));
    const anioTextoMx = parts.year ?? String(ahora.getUTCFullYear());

    const data: PromesaData = {
      fechaTexto: fechaTextoPromesa,
      horaTexto: ahora.toLocaleTimeString('es-MX', {
        timeZone: TZ_MX,
        hour: 'numeric',
        minute: '2-digit',
      }),
      diaTexto: diaTextoMx,
      mesTexto: MESES_ES[mesIdxMx],
      anioTexto: anioTextoMx,
      comprador: {
        nombre: clienteNombre.toUpperCase(),
        curp: persona?.curp ?? null,
        rfc: persona?.rfc ?? null,
        estadoCivil: null, // TODO sprint-7c: capturar estado civil en form
        profesion: persona?.ocupacion ?? null,
        domicilio: persona?.domicilio ?? null,
        ineNumero: venta.ine_numero ?? null,
      },
      coTitular: null, // TODO sprint-7c: agregar FK persona_cotitular_id
      inmueble: {
        fraccionamiento: proyectoFull?.nombre ?? '',
        lote: unidadFull?.numero_lote ?? '',
        manzana: unidadFull?.manzana ?? '',
        superficieM2: Number(unidadFull?.area_m2 ?? 0),
        modeloVivienda: modeloSufijo,
        identificacionInventario,
      },
      operacion: {
        precio,
        precioEnLetra: formatMontoEnLetras(precio),
        enganche1pct: arras1pct,
        arras10pct,
        tipoCredito: venta.tipo_credito ?? '',
      },
      folio: `${(clienteNombre || '')
        .split(/\s+/)
        .map((p) => p[0]?.toUpperCase())
        .filter(Boolean)
        .slice(0, 3)
        .join(
          ''
        )}-${identificacionInventario}-${ahora.toLocaleString('es-MX', { timeZone: TZ_MX })}`,
      watermark: watermarkText,
    };
    const buf = await renderToBuffer(<PromesaCompraventaPDF data={data} />);
    return pdfResponse(buf, `promesa-compraventa-${identificacionInventario || id}.pdf`);
  }

  if (tipo === 'ficu') {
    // KYC fields viven en erp.personas (Sprint 7c-2). El form de Solicitud
    // los persiste ahí, no en dilesa.ventas. Leer desde persona evita el
    // bug de "FICU vacío" cuando los fields de la venta nunca se poblaron.
    const riesgo = evaluarRiesgo({
      tipoPersona: persona?.tipo_persona,
      nacionalidad: persona?.nacionalidad,
      esPep: persona?.es_pep,
      formaPago: persona?.forma_pago_kyc,
      usoEfectivo: persona?.uso_efectivo_kyc,
    });
    const fechaNac = persona?.fecha_nacimiento
      ? new Date(`${persona.fecha_nacimiento}T12:00:00`).toLocaleDateString('es-MX', {
          timeZone: 'America/Matamoros',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '—';
    const data: FicuData = {
      fechaTexto,
      nombres: (persona?.nombre ?? '').toUpperCase(),
      apellidoPaterno: (persona?.apellido_paterno ?? '').toUpperCase(),
      apellidoMaterno: (persona?.apellido_materno ?? '').toUpperCase(),
      fechaNacimientoTexto: fechaNac,
      curp: (persona?.curp ?? '').toUpperCase(),
      rfc: (persona?.rfc ?? '').toUpperCase(),
      identificacion: {
        tipo: 'INE / Credencial para Votar',
        numero: venta.ine_numero ?? '',
        autoridad: 'Instituto Nacional Electoral',
        vigencia: 'Vigente',
      },
      domicilio: { integrado: persona?.domicilio ?? null },
      telefono: persona?.telefono ?? '',
      correo: persona?.email ?? '',
      personalidad: (persona?.tipo_persona ?? 'persona física').toUpperCase(),
      nacionalidad: (persona?.nacionalidad ?? '').toUpperCase(),
      esPep: !!persona?.es_pep,
      formaPago: (persona?.forma_pago_kyc ?? '').toUpperCase(),
      usoEfectivo: (persona?.uso_efectivo_kyc ?? '').toUpperCase(),
      ocupacion: (persona?.ocupacion ?? '').toUpperCase(),
      conocimientoDuenoBeneficiario: persona?.conocimiento_dueno_beneficiario ?? '—',
      criteriosRiesgo: riesgo.criterios,
      scoreTotal: riesgo.scoreTotal,
      clasificacionRiesgo: riesgo.clasificacion,
      clienteNombre,
      identificacionInventario,
      watermark: watermarkText,
    };
    const buf = await renderToBuffer(<FicuPDF data={data} />);
    return pdfResponse(buf, `ficu-${identificacionInventario || id}.pdf`);
  }

  // solicitud-asignacion
  // Calcular precios via RPC
  const { data: calc } = await sb.schema('dilesa').rpc('fn_calcular_precio_venta', {
    p_unidad_id: venta.unidad_id ?? '00000000-0000-0000-0000-000000000000',
    p_monto_credito_titular: Number(venta.monto_credito_titular ?? 0),
    p_monto_credito_cotitular: Number(venta.monto_credito_cotitular ?? 0),
    p_productos_adicionales: Number(venta.productos_adicionales ?? 0),
  });
  const c = calc as Record<string, number> | null;

  // Folio Coda-style: iniciales cliente - identificación - fechaHora
  const iniciales = clienteNombre
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 3)
    .join('');
  const folio = `${iniciales}-${identificacionInventario}-${fechaCreado.toLocaleString('es-MX', { timeZone: 'America/Matamoros' })}`;

  const data: SolicitudData = {
    fechaTexto,
    asesorVentas: vendedorNombre.toUpperCase(),
    valorComercial: Number(c?.valor_comercial ?? 0),
    valorExcedenteTerreno: Number(c?.valor_excedente_terreno ?? 0),
    valorFrenteVerde: Number(c?.valor_frente_verde ?? 0),
    valorEsquina: Number(c?.valor_esquina ?? 0),
    valorVentaFuturo: Number(c?.valor_venta_futuro ?? 0),
    costoCreditoAdicional: Number(c?.costo_credito_adicional ?? 0),
    productosAdicionales: Number(c?.productos_adicionales ?? venta.productos_adicionales ?? 0),
    precioVenta: Number(c?.precio_venta_total ?? 0),
    enganche1pct: Number(c?.enganche_1pct ?? 0),
    isai2pct: Number(c?.isai_2pct ?? 0),
    gastosNotariales6pct: Number(c?.gastos_notariales_6pct ?? 0),
    tipoCredito: venta.tipo_credito ?? '',
    pagoDirecto: Number(c?.pago_directo ?? 0) + Number(c?.apoyo_infonavit ?? 0),
    montoCreditoTitular: Number(venta.monto_credito_titular ?? 0),
    montoCreditoCotitular: Number(venta.monto_credito_cotitular ?? 0),
    totalPagosDisponibles: Number(c?.precio_venta_total ?? 0),
    clienteNombre: `${clienteNombre} (${identificacionInventario})`,
    folio,
    fraccionamiento: '',
    manzana: '',
    lote: '',
    prototipo: '',
    domicilioOficial: '',
    identificacionInventario: '',
    terrenoExcedente: 0,
    frenteVerde: false,
    esquina: false,
    precioM2Excedente: 0,
    watermark: watermarkText,
    ...pdfDataExtra,
  };

  const buf = await renderToBuffer(<SolicitudAsignacionPDF data={data} />);
  return pdfResponse(buf, `solicitud-asignacion-${identificacionInventario || id}.pdf`);
}

function pdfResponse(buf: Buffer, filename: string): Response {
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
