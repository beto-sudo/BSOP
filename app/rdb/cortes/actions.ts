'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Voucher } from '@/components/cortes/types';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
const VOUCHERS_BUCKET = 'cortes-vouchers';
const VOUCHER_MAX_BYTES = 10 * 1024 * 1024;
const VOUCHER_ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type AbrirCajaInput = {
  caja_id: string;
  caja_nombre: string;
  responsable_apertura: string;
  efectivo_inicial: number;
  fecha_operativa: string; // YYYY-MM-DD
};

export async function abrirCaja(input: AbrirCajaInput): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No autenticado');

  // Check for an existing open turn on this caja (case-insensitive)
  const { data: existing, error: checkErr } = await supabase
    .schema('erp')
    .from('cortes_caja')
    .select('id')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('caja_nombre', input.caja_nombre)
    .eq('estado', 'abierto')
    .maybeSingle();

  if (checkErr) throw new Error(checkErr.message);

  if (existing) {
    throw new Error(
      'Ya existe un turno abierto para esta caja. Ciérralo antes de abrir uno nuevo.'
    );
  }

  const now = new Date().toISOString();

  const { data: corte, error: insertErr } = await supabase
    .schema('erp')
    .from('cortes_caja')
    .insert({
      empresa_id: RDB_EMPRESA_ID,
      caja_nombre: input.caja_nombre,
      estado: 'abierto',
      efectivo_inicial: input.efectivo_inicial,
      fecha_operativa: input.fecha_operativa,
      abierto_at: now,
      observaciones: input.responsable_apertura,
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);
  if (!corte) throw new Error('Error al abrir el turno de caja');

  revalidatePath('/rdb/cortes');
  return corte as { id: string };
}

export type Denominacion = {
  denominacion: number;
  tipo: 'billete' | 'moneda';
  cantidad: number;
};

export type CerrarCajaInput = {
  corte_id: string;
  denominaciones: Denominacion[];
  observaciones?: string;
};

export async function cerrarCaja(input: CerrarCajaInput): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No autenticado');

  // Calcular total desde denominaciones
  const efectivo_contado = input.denominaciones.reduce(
    (sum, d) => sum + d.denominacion * d.cantidad,
    0
  );

  const now = new Date().toISOString();

  // Actualizar corte
  const { error } = await supabase
    .schema('erp')
    .from('cortes_caja')
    .update({
      estado: 'cerrado',
      cerrado_at: now,
      efectivo_contado,
      observaciones: input.observaciones ?? null,
      updated_at: now,
    })
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('id', input.corte_id);

  if (error) throw new Error(error.message);

  // Guardar denominaciones (solo las que tienen cantidad > 0)
  const rows = input.denominaciones
    .filter((d) => d.cantidad > 0)
    .map((d) => ({
      corte_id: input.corte_id,
      denominacion: d.denominacion,
      tipo: d.tipo,
      cantidad: d.cantidad,
    }));

  if (rows.length > 0) {
    const { error: denomErr } = await supabase
      .schema('erp')
      .from('corte_conteo_denominaciones')
      .upsert(
        rows.map((r) => ({ ...r, empresa_id: RDB_EMPRESA_ID })),
        { onConflict: 'corte_id,denominacion' }
      );
    if (denomErr) throw new Error(denomErr.message);
  }

  revalidatePath('/rdb/cortes');
}

export type RegistrarMovimientoInput = {
  corte_id: string;
  tipo: 'entrada' | 'salida';
  tipo_detalle: string;
  monto: number;
  concepto: string;
};

export async function registrarMovimiento(
  input: RegistrarMovimientoInput
): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No autenticado');

  // Audit trail: quien capturó = user logueado. No confiamos en input del cliente.
  const userMeta = session.user.user_metadata as { full_name?: string } | undefined;
  const realizadoPorNombre = (userMeta?.full_name || session.user.email || '').trim();
  if (!realizadoPorNombre) throw new Error('Usuario sin nombre ni email registrado');

  if (!input.corte_id) throw new Error('corte_id requerido');
  if (!input.monto || input.monto <= 0) throw new Error('Monto debe ser mayor a 0');
  if (!input.concepto?.trim()) throw new Error('Concepto requerido');
  if (!['entrada', 'salida'].includes(input.tipo)) {
    throw new Error(`tipo inválido: ${input.tipo}`);
  }

  // Solo cortes abiertos aceptan movimientos; cierres son inmutables.
  const { data: corte, error: fetchErr } = await supabase
    .schema('erp')
    .from('cortes_caja')
    .select('id, estado')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('id', input.corte_id)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!corte) throw new Error('Corte no encontrado');
  if (corte.estado !== 'abierto') {
    throw new Error(
      `No se puede registrar movimiento: el corte está "${corte.estado}". Solo cortes abiertos aceptan movimientos.`
    );
  }

  // Escribimos directo a erp.movimientos_caja. NO llamar rdb.upsert_movimiento:
  // está DEPRECATED desde PR #172 y lanza RAISE WARNING — ese shim es solo
  // para callers tardíos de Coda.
  const { data: mov, error: insertErr } = await supabase
    .schema('erp')
    .from('movimientos_caja')
    .insert({
      empresa_id: RDB_EMPRESA_ID,
      corte_id: input.corte_id,
      tipo: input.tipo,
      tipo_detalle: input.tipo_detalle,
      monto: input.monto,
      concepto: input.concepto.trim(),
      realizado_por_nombre: realizadoPorNombre,
      // `referencia` se reserva para marca histórica de Coda (i-xxxxx).
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);
  if (!mov) throw new Error('Error al registrar movimiento');

  revalidatePath('/rdb/cortes');
  return mov as { id: string };
}

// ─── Vouchers de terminal (cierres de lote BBVA) ──────────────────────────────

export type SubirVoucherInput = {
  corte_id: string;
  file: File;
};

export async function subirVoucher(
  input: SubirVoucherInput
): Promise<{ id: string; signed_url: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No autenticado');

  if (input.file.size > VOUCHER_MAX_BYTES) {
    throw new Error('Archivo excede 10 MB');
  }
  if (!VOUCHER_ALLOWED_MIMES.includes(input.file.type as (typeof VOUCHER_ALLOWED_MIMES)[number])) {
    throw new Error(`Tipo no permitido: ${input.file.type}`);
  }

  // Corte debe existir y pertenecer a RDB.
  const { data: corte, error: corteErr } = await supabase
    .schema('erp')
    .from('cortes_caja')
    .select('id')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('id', input.corte_id)
    .maybeSingle();
  if (corteErr) throw new Error(corteErr.message);
  if (!corte) throw new Error('Corte no encontrado');

  // Path determinista: rdb/{corte_id}/{uuid}.{ext}.
  const ext = (input.file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const storage_path = `rdb/${input.corte_id}/${crypto.randomUUID()}.${ext || 'jpg'}`;

  const { error: uploadErr } = await supabase.storage
    .from(VOUCHERS_BUCKET)
    .upload(storage_path, input.file, {
      contentType: input.file.type,
      upsert: false,
    });
  if (uploadErr) throw new Error(`Upload falló: ${uploadErr.message}`);

  const userMeta = session.user.user_metadata as { full_name?: string } | undefined;
  const uploadedByNombre = (userMeta?.full_name || session.user.email || '').trim();

  const { data: voucher, error: insertErr } = await supabase
    .schema('erp')
    .from('cortes_vouchers')
    .insert({
      empresa_id: RDB_EMPRESA_ID,
      corte_id: input.corte_id,
      storage_path,
      nombre_original: input.file.name,
      tamano_bytes: input.file.size,
      mime_type: input.file.type,
      uploaded_by: session.user.id,
      uploaded_by_nombre: uploadedByNombre,
    })
    .select('id')
    .single();

  if (insertErr) {
    // Rollback del archivo si el INSERT falla (p.ej. por RLS).
    await supabase.storage.from(VOUCHERS_BUCKET).remove([storage_path]);
    throw new Error(insertErr.message);
  }

  const { data: signed } = await supabase.storage
    .from(VOUCHERS_BUCKET)
    .createSignedUrl(storage_path, 3600);

  revalidatePath('/rdb/cortes');
  return { id: voucher.id, signed_url: signed?.signedUrl || '' };
}

export async function eliminarVoucher(voucher_id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No autenticado');

  // RLS ya limita DELETE a uploaded_by = fn_current_user_id() OR admin.
  // Leer el storage_path antes de borrar la fila.
  const { data: voucher, error: fetchErr } = await supabase
    .schema('erp')
    .from('cortes_vouchers')
    .select('storage_path')
    .eq('id', voucher_id)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!voucher) throw new Error('Voucher no encontrado (o sin permisos)');

  const { error: delRowErr } = await supabase
    .schema('erp')
    .from('cortes_vouchers')
    .delete()
    .eq('id', voucher_id);
  if (delRowErr) throw new Error(delRowErr.message);

  // Best-effort: si el archivo falla, la fila ya no existe y el archivo queda huérfano.
  await supabase.storage.from(VOUCHERS_BUCKET).remove([voucher.storage_path]);

  revalidatePath('/rdb/cortes');
}

export async function obtenerVouchersDelCorte(corte_id: string): Promise<Voucher[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .schema('erp')
    .from('cortes_vouchers')
    .select(
      'id, corte_id, storage_path, nombre_original, tamano_bytes, mime_type, afiliacion, monto_reportado, uploaded_by_nombre, uploaded_at'
    )
    .eq('corte_id', corte_id)
    .order('uploaded_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // createSignedUrls hace un solo round-trip — más barato que N createSignedUrl.
  const paths = rows.map((r) => r.storage_path);
  const { data: signed } = await supabase.storage
    .from(VOUCHERS_BUCKET)
    .createSignedUrls(paths, 3600);

  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }

  return rows.map((r) => ({
    ...r,
    signed_url: urlByPath.get(r.storage_path) ?? null,
  })) as Voucher[];
}
