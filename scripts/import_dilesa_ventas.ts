/**
 * import_dilesa_ventas.ts
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 3 — importación Fase 4.
 * Jala la tabla `Clientes` del Coda DILESA (doc ZNxWl_DI2D) — 1,429 ventas —
 * y la carga en el schema de comercialización v2:
 *
 *   - El comprador  → erp.personas (tipo='cliente'), dedup por CURP.
 *   - La transacción → dilesa.ventas (liga persona ↔ unidad).
 *   - El pipeline    → dilesa.venta_fases (una fila por fase alcanzada).
 *   - Los depósitos  → dilesa.venta_pagos (de la tabla Depositos Clientes).
 *
 * El expediente digital (PDFs) NO se importa aquí — es Fase 4.5.
 * Mapeo: docs/planning/dilesa-portafolio-mapeo-coda.md § 6.
 *
 * Idempotente para ventas/fases/pagos: borra las ventas de DILESA y
 * re-inserta (venta_fases y venta_pagos caen por FK ON DELETE CASCADE).
 * Las personas NO se borran (tabla compartida): se hace upsert por CURP —
 * re-correr reusa las personas ya creadas. Las personas sin CURP se
 * re-insertan en cada corrida (poco frecuente — el CURP es requisito del
 * crédito).
 *
 * Prerequisites (env): CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_ventas.ts
 *   npx tsx scripts/import_dilesa_ventas.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, num, int, dateStr, bool } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_CLIENTES = 'grid-mMIXWCSfyr';
const CODA_DEPOSITOS = 'grid-Foeo80pE3s';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** Las 17 fases: columna `F📅<fase>` de Coda → nombre canónico + posición. */
const FASES: Array<{ col: string; fase: string; pos: number }> = [
  { col: 'F📅Solicitud de Asignación', fase: 'Solicitud de Asignación', pos: 1 },
  { col: 'F📅Asignada', fase: 'Asignada', pos: 2 },
  { col: 'F📅Formalizada', fase: 'Formalizada', pos: 3 },
  { col: 'F📅Solicitud de Avalúo', fase: 'Solicitud de Avalúo', pos: 4 },
  { col: 'F📅Avalúo Cerrado', fase: 'Avalúo Cerrado', pos: 5 },
  { col: 'F📅Inscrita', fase: 'Inscrita', pos: 6 },
  { col: 'F📅Solicitud de Dictaminación', fase: 'Solicitud de Dictaminación', pos: 7 },
  { col: 'F📅Dictaminada', fase: 'Dictaminada', pos: 8 },
  { col: 'F📅Validación Patronal', fase: 'Validación Patronal', pos: 9 },
  { col: 'F📅Firmas Programadas', fase: 'Firmas Programadas', pos: 10 },
  { col: 'F📅Escriturada', fase: 'Escriturada', pos: 11 },
  { col: 'F📅Detonada', fase: 'Detonada', pos: 12 },
  { col: 'F📅Facturada', fase: 'Facturada', pos: 13 },
  { col: 'F📅Preparada para Entrega', fase: 'Preparada para Entrega', pos: 14 },
  { col: 'F📅Entregada', fase: 'Entregada', pos: 15 },
  { col: 'F📅Comision Pagada', fase: 'Comisión Pagada', pos: 16 },
  { col: 'F📅Operacion Terminada', fase: 'Operación Terminada', pos: 17 },
];

/** `erp.personas.tipo_persona` desde "Personalidad" (Coda). */
function mapTipoPersona(v: string | null): string {
  return (v ?? '').toLowerCase().includes('moral') ? 'moral' : 'fisica';
}

/**
 * CURP "real" para dedup. Rechaza basura histórica de Coda — antes de
 * que el campo fuera requerido los llenaban con `X`, `XXXXXXXXXX`, etc.
 * Si esto regresa false, la persona NO se dedupea por CURP (se inserta
 * como persona nueva).
 *
 * Una CURP real es 18 chars alfanum (4 letras + 6 dígitos + 6 chars +
 * 2 chars). Aquí solo chequeamos longitud y que no sea puro `X`.
 */
function isCurpValid(c: string | null | undefined): boolean {
  if (!c) return false;
  const s = c.trim().toUpperCase();
  if (s.length !== 18) return false;
  if (/^X+$/.test(s)) return false;
  return true;
}

/** Boolean opcional: "" → null, "No" → false, "Sí" → true. */
function boolOpt(v: unknown): boolean | null {
  const s = str(v);
  return s === null ? null : bool(s);
}

/** Concatena las 6 columnas de domicilio de Coda en un texto. */
function buildDomicilio(parts: Array<string | null>): string | null {
  const calle = [parts[0], parts[1]].filter(Boolean).join(' ');
  const cp = parts[5] ? `CP ${parts[5]}` : null;
  const linea = [calle, parts[2], parts[3], parts[4], cp].filter(Boolean).join(', ');
  return linea || null;
}

/** Resuelve `Inventario` de Coda (M3-L9-LDLE-ISC) a un id de dilesa.unidades. */
function resolveUnidad(inv: string | null, unidadMap: Map<string, string>): string | null {
  if (!inv) return null;
  // El identificador de la unidad es {M-L-proyecto}; Coda agrega -{modelo}.
  return unidadMap.get(inv) ?? unidadMap.get(inv.replace(/-[^-]+$/, '')) ?? null;
}

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: emp, error: empErr } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (empErr || !emp) throw new Error(`No se encontró la empresa DILESA: ${empErr?.message}`);
  const empresaId = emp.id as string;

  // ── Coda: Clientes + Depósitos ──────────────────────────────────────────────
  const cCols = await coda.listColumns(CODA_DOC, CODA_CLIENTES);
  const cm = buildColumnMap(cCols);
  const cRows = await coda.listRowsAll(CODA_DOC, CODA_CLIENTES);
  console.log(`Coda: ${cRows.length} filas en Clientes.`);

  const dCols = await coda.listColumns(CODA_DOC, CODA_DEPOSITOS);
  const dm = buildColumnMap(dCols);
  const dRows = await coda.listRowsAll(CODA_DOC, CODA_DEPOSITOS);
  console.log(`Coda: ${dRows.length} filas en Depositos Clientes.`);

  // unidades: identificador → id (para resolver el vínculo a la unidad).
  const { data: unidades, error: uErr } = await sb
    .schema('dilesa')
    .from('unidades')
    .select('id, identificador')
    .eq('empresa_id', empresaId);
  if (uErr) throw new Error(`Error leyendo unidades: ${uErr.message}`);
  const unidadMap = new Map(
    (unidades ?? []).map((u) => [u.identificador as string, u.id as string])
  );

  // personas existentes de DILESA: CURP → id (para dedup, sólo CURPs válidos).
  const { data: personas, error: pErr } = await sb
    .schema('erp')
    .from('personas')
    .select('id, curp')
    .eq('empresa_id', empresaId);
  if (pErr) throw new Error(`Error leyendo personas: ${pErr.message}`);
  const curpMap = new Map<string, string>();
  for (const p of personas ?? []) {
    const c = p.curp as string | null;
    if (isCurpValid(c)) curpMap.set(c!.trim().toUpperCase(), p.id as string);
  }

  // ── Parseo de cada fila de Clientes ─────────────────────────────────────────
  const registros = cRows
    .map((row) => {
      const v = row.values;
      const nombre = str(pick(v, cm, 'Nombre'));
      if (!nombre) return null; // sin nombre no es una venta — se omite

      // CURP "real" para dedup. Si Coda tiene basura (X, XXX, etc.) se
      // guarda igual en la persona pero NO se usa como llave de dedup.
      const curpRaw = str(pick(v, cm, 'CURP'));
      const curp = curpRaw?.trim().toUpperCase() ?? null;

      const persona = {
        empresa_id: empresaId,
        tipo: 'cliente',
        nombre,
        apellido_paterno: str(pick(v, cm, 'Apellido Paterno')),
        apellido_materno: str(pick(v, cm, 'Apellido Materno')),
        email: str(pick(v, cm, 'email')),
        telefono: str(pick(v, cm, 'Telefono')),
        curp,
        rfc: str(pick(v, cm, 'RFC')),
        nss: str(pick(v, cm, 'NSS')),
        fecha_nacimiento: dateStr(pick(v, cm, 'Fecha de Nacimiento')),
        nacionalidad: str(pick(v, cm, 'Nacionalidad')),
        tipo_persona: mapTipoPersona(str(pick(v, cm, 'Personalidad'))),
        estado_civil: str(pick(v, cm, 'Compra Soltero/Casado')),
        domicilio: buildDomicilio([
          str(pick(v, cm, 'Calle Domicilio')),
          str(pick(v, cm, 'Numero Domicilio')),
          str(pick(v, cm, 'Colonia Domicilio')),
          str(pick(v, cm, 'Ciudad Domicilio')),
          str(pick(v, cm, 'Estado Domicilio')),
          str(pick(v, cm, 'Codigo Postal Domicilio')),
        ]),
      };

      const inv = str(pick(v, cm, 'Inventario'));
      const invDesasignado = str(pick(v, cm, 'Inventario Desasignado'));
      const unidadId = resolveUnidad(inv, unidadMap) ?? resolveUnidad(invDesasignado, unidadMap);
      const desasignada = dateStr(pick(v, cm, 'F📅Desasigna🚫')) !== null;

      const venta = {
        empresa_id: empresaId,
        coda_row_id: row.id, // llave estable para re-imports + match expediente
        unidad_id: unidadId,
        estado: desasignada ? 'desasignada' : 'activa',
        fase_actual: str(pick(v, cm, 'Fase de Venta')),
        fase_posicion: int(pick(v, cm, 'Posición Fase de Venta')),
        tipo_credito: str(pick(v, cm, 'Tipo de Credito')),
        valor_comercial: num(pick(v, cm, 'Valor Comercial')),
        valor_escrituracion: num(pick(v, cm, 'Valor de Escrituración')),
        precio_asignacion: num(pick(v, cm, 'Precio De Asignación')),
        monto_credito_titular: num(pick(v, cm, 'Monto de Credito Titular')),
        monto_credito_cotitular: num(pick(v, cm, 'Monto de Credito Co-Titular')),
        credito_titular_ref: str(pick(v, cm, 'Numero del Crédito Titular e Institución')),
        credito_cotitular_ref: str(pick(v, cm, 'Numero de credito Co-Titular e Institución')),
        enganche_requerido: num(pick(v, cm, 'Enganche Requerido')),
        descuento_total: num(pick(v, cm, 'Descuento Otorgado Total')),
        comision_vendedor: num(pick(v, cm, 'Comision Vendedor')),
        comision_gerencia: num(pick(v, cm, 'Comision Gerencia de Ventas')),
        anticipo_comision: num(pick(v, cm, 'Anticipo Comision por Asignacion')),
        vendedor: str(pick(v, cm, 'Vendedor')),
        notario: str(pick(v, cm, 'Notario')),
        casa_valuadora: str(pick(v, cm, 'Casa Valuadora')),
        monto_avaluo: num(pick(v, cm, 'Monto Avalúo')),
        gastos_escrituracion: num(pick(v, cm, 'Gastos Escrituración')),
        numero_escritura: str(pick(v, cm, '#Escritura')),
        fecha_escritura: dateStr(pick(v, cm, 'Fecha de Escritura')),
        es_pep: boolOpt(pick(v, cm, 'Persona Políticamente Expuesta')),
        ocupacion: str(pick(v, cm, 'Actividad Ocupacion o Profesion')),
        ine_numero: str(pick(v, cm, 'Numero de Credencial INE')),
        forma_pago: str(pick(v, cm, 'Forma de Pago')),
        uso_efectivo: str(pick(v, cm, 'Uso de Efectivo')),
        conocimiento_dueno_beneficiario: str(pick(v, cm, 'Conocimiento Dueño Beneficiario')),
        motivo_desasignacion: str(pick(v, cm, 'Motivo por el cual se libera inventario')),
      };

      const fases = FASES.map((f) => ({
        fase: f.fase,
        posicion: f.pos,
        fecha: dateStr(v[cm.get(f.col.toLowerCase()) ?? '']),
      })).filter((f) => f.fecha !== null);

      return { clienteName: row.name, codaRowId: row.id, persona, venta, fases };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Depósitos parseados (se ligan por nombre de cliente más abajo).
  const depositos = dRows.map((row) => ({
    clienteName: str(pick(row.values, dm, 'Cliente')),
    fecha: dateStr(pick(row.values, dm, 'Fecha Deposito')),
    monto: num(pick(row.values, dm, 'Monto Deposito')),
    tipo: str(pick(row.values, dm, 'Tipo de Deposito')),
  }));

  const sinUnidad = registros.filter((r) => !r.venta.unidad_id).length;
  // "Sin CURP útil" = CURP basura (XXX, len!=18) o vacío → no se dedupea,
  // se inserta persona nueva por cada venta.
  const sinCurpUtil = registros.filter((r) => !isCurpValid(r.persona.curp)).length;
  const totalFases = registros.reduce((n, r) => n + r.fases.length, 0);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no se escribe nada ===\n');
    console.log(
      `Ventas a importar:       ${registros.length} (omitidas sin nombre: ${cRows.length - registros.length})`
    );
    console.log(`  sin unidad resuelta:   ${sinUnidad}`);
    console.log(`  sin CURP útil:         ${sinCurpUtil} (basura o vacío — persona nueva c/u)`);
    console.log(`Filas venta_fases:       ${totalFases}`);
    console.log(`Depósitos:               ${depositos.length}`);
    const curpsNuevos = new Set(
      registros
        .map((r) => (isCurpValid(r.persona.curp) ? r.persona.curp!.trim().toUpperCase() : null))
        .filter((c): c is string => !!c && !curpMap.has(c))
    );
    console.log(
      `Personas nuevas (CURP):  ${curpsNuevos.size}  (CURPs existentes reusados: ${registros.length - curpsNuevos.size - sinCurpUtil})`
    );
    return;
  }

  // Idempotencia: limpiar ventas previas (venta_fases + venta_pagos caen por CASCADE).
  const { error: delErr } = await sb
    .schema('dilesa')
    .from('ventas')
    .delete()
    .eq('empresa_id', empresaId);
  if (delErr) throw new Error(`Error limpiando ventas previas: ${delErr.message}`);

  // Cleanup de personas-basura preexistentes: las que tenían CURP "X"/"XXX"
  // y fueron mergeadas erróneamente. Después del DELETE de ventas, quedan
  // huérfanas (sin venta referenciándolas). Las borramos antes de re-insertar
  // para no acumular ghost personas. Sólo borramos las que NO tienen ninguna
  // venta en NINGÚN schema referenciándolas (idempotencia segura).
  const huerfanasIds = (personas ?? [])
    .filter((p) => {
      const c = p.curp as string | null;
      if (c === null) return false; // sin CURP — pudo ser legítima
      const s = c.trim().toUpperCase();
      // CURP basura: vacío, len != 18, o puro X
      return s === '' || s.length !== 18 || /^X+$/.test(s);
    })
    .map((p) => p.id as string);
  if (huerfanasIds.length > 0) {
    const { error: delPErr } = await sb
      .schema('erp')
      .from('personas')
      .delete()
      .in('id', huerfanasIds);
    if (delPErr) {
      console.warn(
        `⚠ No se pudieron borrar ${huerfanasIds.length} personas-basura (probable FK a otra tabla): ${delPErr.message}`
      );
    } else {
      console.log(`✔ Borradas ${huerfanasIds.length} personas-basura (CURP inválido).`);
    }
  }

  // ── Personas: upsert por CURP (sólo si CURP es válida) ─────────────────────
  // Con CURP válida: se insertan las nuevas en lote y se mapean por CURP.
  const nuevasConCurp = new Map<string, (typeof registros)[number]['persona']>();
  for (const r of registros) {
    if (!isCurpValid(r.persona.curp)) continue;
    const curp = r.persona.curp!.trim().toUpperCase();
    if (!curpMap.has(curp) && !nuevasConCurp.has(curp)) {
      nuevasConCurp.set(curp, r.persona);
    }
  }
  if (nuevasConCurp.size > 0) {
    const { data: ins, error } = await sb
      .schema('erp')
      .from('personas')
      .insert([...nuevasConCurp.values()])
      .select('id, curp');
    if (error) throw new Error(`Error insertando personas: ${error.message}`);
    for (const p of ins ?? []) {
      if (p.curp) curpMap.set((p.curp as string).trim().toUpperCase(), p.id as string);
    }
  }
  // CURP inválida (basura o vacía): se insertan en orden y se enlazan por
  // posición. UNA persona por registro — NO se dedupea por CURP basura
  // (antes mergeaba todos los XXXXXXXXXX en una sola persona).
  const sinCurpRegs = registros.filter((r) => !isCurpValid(r.persona.curp));
  const sinCurpIds: string[] = [];
  if (sinCurpRegs.length > 0) {
    // Insertar en chunks para evitar payloads enormes.
    const CHUNK_P = 300;
    for (let i = 0; i < sinCurpRegs.length; i += CHUNK_P) {
      const slice = sinCurpRegs.slice(i, i + CHUNK_P);
      const { data: ins, error } = await sb
        .schema('erp')
        .from('personas')
        .insert(slice.map((r) => r.persona))
        .select('id');
      if (error) throw new Error(`Error insertando personas sin CURP útil: ${error.message}`);
      sinCurpIds.push(...(ins ?? []).map((p) => p.id as string));
    }
  }
  const sinCurpPersonaId = new Map(sinCurpRegs.map((r, i) => [r, sinCurpIds[i]]));

  const personaIdDe = (r: (typeof registros)[number]): string => {
    if (isCurpValid(r.persona.curp)) return curpMap.get(r.persona.curp!.trim().toUpperCase())!;
    return sinCurpPersonaId.get(r)!;
  };

  // ── Ventas (en lotes; RETURNING preserva el orden del VALUES) ────────────────
  const nameToVentaId = new Map<string, string>();
  let okV = 0;
  const CHUNK = 300;
  const fasesInserts: Array<Record<string, unknown>> = [];
  for (let i = 0; i < registros.length; i += CHUNK) {
    const chunk = registros.slice(i, i + CHUNK);
    const ventaRows = chunk.map((r) => ({ ...r.venta, persona_id: personaIdDe(r) }));
    const { data: ins, error } = await sb
      .schema('dilesa')
      .from('ventas')
      .insert(ventaRows)
      .select('id');
    if (error) {
      console.error(`✗ chunk ventas [${i}..${i + chunk.length}): ${error.message}`);
      continue;
    }
    const ids = (ins ?? []).map((x) => x.id as string);
    chunk.forEach((r, j) => {
      const ventaId = ids[j];
      if (!ventaId) return;
      okV++;
      if (r.clienteName) nameToVentaId.set(r.clienteName, ventaId);
      for (const f of r.fases) {
        fasesInserts.push({ empresa_id: empresaId, venta_id: ventaId, ...f });
      }
    });
  }

  // ── venta_fases ─────────────────────────────────────────────────────────────
  let okF = 0;
  for (let i = 0; i < fasesInserts.length; i += 500) {
    const chunk = fasesInserts.slice(i, i + 500);
    const { error } = await sb.schema('dilesa').from('venta_fases').insert(chunk);
    if (error) console.error(`✗ chunk venta_fases [${i}): ${error.message}`);
    else okF += chunk.length;
  }

  // ── venta_pagos (depósitos ligados por nombre de cliente) ────────────────────
  let okP = 0;
  let pagosHuerfanos = 0;
  const pagoInserts: Array<Record<string, unknown>> = [];
  for (const d of depositos) {
    const ventaId = d.clienteName ? nameToVentaId.get(d.clienteName) : undefined;
    if (!ventaId) {
      pagosHuerfanos++;
      continue;
    }
    pagoInserts.push({
      empresa_id: empresaId,
      venta_id: ventaId,
      fecha: d.fecha,
      monto: d.monto ?? 0,
      tipo: d.tipo,
    });
  }
  for (let i = 0; i < pagoInserts.length; i += 500) {
    const chunk = pagoInserts.slice(i, i + 500);
    const { error } = await sb.schema('dilesa').from('venta_pagos').insert(chunk);
    if (error) console.error(`✗ chunk venta_pagos [${i}): ${error.message}`);
    else okP += chunk.length;
  }

  console.log(
    `\n✔ Importadas ${okV}/${registros.length} ventas, ${okF} fases de pipeline, ` +
      `${okP} pagos${pagosHuerfanos ? ` (${pagosHuerfanos} depósitos sin venta — omitidos)` : ''}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
