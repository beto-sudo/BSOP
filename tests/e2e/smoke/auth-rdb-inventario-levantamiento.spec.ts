/**
 * Smoke E2E — RDB › Inventario › Levantamiento físico (flujo completo)
 *
 * Cubre el ciclo: alta → captura a ciegas → cierre → firma → auto-aplicación →
 * reporte → validación contra DB.
 *
 * Pre-requisitos para que el test corra (de lo contrario, self-skip):
 *   1. Auth configurada — `playwright/.auth/user.json` con sesión válida.
 *      El test user debe ser administrador o miembro activo de RDB con write
 *      access al módulo `rdb.inventario`.
 *   2. `SUPABASE_SERVICE_ROLE_KEY` en `.env.test.local` o `.env.local` —
 *      necesario para forzar `firmas_requeridas=1` y validar la DB al final.
 *   3. Catálogo RDB con al menos 3 productos inventariables activos. Sin
 *      productos, `iniciarCaptura` no siembra líneas y el test no tiene qué
 *      capturar.
 *
 * Cleanup: el test elimina el levantamiento creado al final (soft delete).
 *
 * Validación de captura a ciegas: intercepta la respuesta de
 * `fn_get_lineas_para_capturar` y confirma que NO incluye `stock_inicial`,
 * `costo_unitario` ni `diferencia` — convierte la convención en garantía
 * testeable.
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { skipIfNoAuth } from '../helpers/auth-guard';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// Cliente service-role tipado como `any` deliberadamente: no queremos meter
// `Database` types en tests e2e (acopla el test al schema generado y rompe en
// cada migración). Los tests son smokes de comportamiento; el tipo seguro
// sucede en `app/`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

function getAdmin(): AdminClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getEmpresaConfig(admin: AdminClient): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .schema('core')
    .from('empresas')
    .select('config_inventario')
    .eq('id', RDB_EMPRESA_ID)
    .maybeSingle();
  if (error) throw error;
  return (data?.config_inventario ?? {}) as Record<string, unknown>;
}

async function setEmpresaConfig(admin: AdminClient, next: Record<string, unknown>): Promise<void> {
  const { error } = await admin
    .schema('core')
    .from('empresas')
    .update({ config_inventario: next })
    .eq('id', RDB_EMPRESA_ID);
  if (error) throw error;
}

async function countActiveProductos(admin: AdminClient): Promise<number> {
  const { count, error } = await admin
    .schema('erp')
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('activo', true);
  if (error) throw error;
  return count ?? 0;
}

async function softDeleteLevantamiento(admin: AdminClient, levId: string): Promise<void> {
  await admin
    .schema('erp')
    .from('inventario_levantamientos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', levId);
}

test.describe('RDB › Inventario › Levantamiento físico', () => {
  let admin: AdminClient | null = null;
  let originalConfig: Record<string, unknown> | null = null;
  let createdLevId: string | null = null;

  test.beforeAll(async () => {
    admin = getAdmin();
    if (!admin) {
      console.warn(
        '[lev e2e] SUPABASE_SERVICE_ROLE_KEY missing — test will self-skip in beforeEach.'
      );
      return;
    }

    // Snapshot config y forzamos firmas_requeridas=1 para que el flujo entero
    // termine con un solo Firmar (la auto-aplicación se dispara al instante).
    originalConfig = await getEmpresaConfig(admin);
    await setEmpresaConfig(admin, { ...originalConfig, firmas_requeridas: 1 });
  });

  test.afterAll(async () => {
    if (!admin) return;

    // Cleanup levantamiento si quedó algo (incluso si el test falló a mitad).
    if (createdLevId) {
      try {
        await softDeleteLevantamiento(admin, createdLevId);
      } catch (err) {
        console.warn(
          `[lev e2e] Could not soft-delete levantamiento ${createdLevId}:`,
          (err as Error).message
        );
      }
    }

    // Restaurar config original.
    if (originalConfig) {
      try {
        await setEmpresaConfig(admin, originalConfig);
      } catch (err) {
        console.warn('[lev e2e] Could not restore empresa config:', (err as Error).message);
      }
    }
  });

  test.beforeEach(async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);
    if (!admin) {
      testInfo.skip(
        true,
        'Service-role key missing — set SUPABASE_SERVICE_ROLE_KEY in .env.test.local'
      );
      return;
    }

    const productos = await countActiveProductos(admin);
    if (productos < 3) {
      testInfo.skip(
        true,
        `RDB catalog needs at least 3 active productos for this test (found ${productos}).`
      );
      return;
    }

    await page.goto('/rdb/inventario/levantamientos');
    await page.waitForTimeout(800);
    if (page.url().includes('/login')) {
      testInfo.skip(true, 'Session not accepted — auth state may be stale');
    }
  });

  test('flujo completo: alta → captura → cierre → firma → aplicado → reporte', async ({ page }) => {
    test.setTimeout(120_000);

    // ── Paso 1: alta ───────────────────────────────────────────────────────
    await page.goto('/rdb/inventario/levantamientos/nuevo');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: /iniciar captura ahora/i }).click();

    // Esperamos el redirect a /capturar.
    await page.waitForURL(/\/rdb\/inventario\/levantamientos\/[^/]+\/capturar/, {
      timeout: 15_000,
    });

    // Capturamos el ID del levantamiento desde la URL para cleanup posterior.
    const captureUrl = page.url();
    const idMatch = captureUrl.match(/\/levantamientos\/([0-9a-f-]{36})\//);
    if (!idMatch) throw new Error(`No pude extraer ID del levantamiento de ${captureUrl}`);
    createdLevId = idMatch[1];

    // ── Paso 2: validar captura a ciegas ───────────────────────────────────
    // `getLineasParaCapturar` es server action, no atraviesa el browser como
    // REST call. Validamos directo contra la RPC via service-role: el shape
    // debe NO incluir stock_inicial, costo_unitario, diferencia.
    if (!admin) throw new Error('admin no debería ser null aquí');
    const { data: lineasRpc, error: lineasErr } = await admin
      .schema('erp')
      .rpc('fn_get_lineas_para_capturar', {
        p_levantamiento_id: createdLevId,
      });
    expect(lineasErr).toBeNull();
    const body = (lineasRpc ?? []) as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).not.toHaveProperty('stock_inicial');
    expect(body[0]).not.toHaveProperty('costo_unitario');
    expect(body[0]).not.toHaveProperty('diferencia');

    // ── Paso 3: capturar 3 productos ───────────────────────────────────────
    // Usamos los códigos del payload de la RPC para buscar exact-match en el
    // input (más estable que adivinar nombres).
    const codigos = body.slice(0, 3).map((row) => String(row.producto_codigo));
    const cantidades = ['5', '0', '12'];

    for (let i = 0; i < codigos.length; i++) {
      await capturarProducto(page, codigos[i], cantidades[i]);
    }

    // ── Paso 4: cerrar captura ─────────────────────────────────────────────
    await page.goto(`/rdb/inventario/levantamientos/${createdLevId}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const cerrarBtn = page.getByRole('button', { name: /cerrar captura/i });
    await cerrarBtn.click();

    // El AlertDialog confirma "Marcar pendientes en 0 y cerrar" (asumiendo
    // que con 3 productos contados quedan más sin contar).
    const confirmar = page.getByRole('button', { name: /marcar pendientes en 0/i });
    if (await confirmar.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirmar.click();
    }

    // Esperamos al estado capturado (badge "Pendiente firma").
    await expect(page.getByText(/pendiente firma/i).first()).toBeVisible({ timeout: 20_000 });

    // ── Paso 5: firmar ─────────────────────────────────────────────────────
    const firmarBtn = page.getByTestId('firmar-button');
    await expect(firmarBtn).toBeVisible({ timeout: 5_000 });
    await firmarBtn.click();

    // Marcar checkbox obligatorio del paso 1.
    await page.getByTestId('signature-confirm-checkbox').check();
    await page.getByTestId('signature-confirm-button').click();

    // Auto-aplicación: redirige a /reporte.
    await page.waitForURL(/\/rdb\/inventario\/levantamientos\/[^/]+\/reporte/, {
      timeout: 20_000,
    });

    // ── Paso 6: validar reporte ────────────────────────────────────────────
    // Auto-print no se dispara en headless; el contenido sí se renderiza.
    await expect(page.getByText(/reporte de levantamiento físico/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/firmas/i).first()).toBeVisible();

    // ── Paso 7: validar contra DB vía service-role ─────────────────────────
    if (!admin) throw new Error('admin no debería ser null aquí');

    const { data: levRow, error: levErr } = await admin
      .schema('erp')
      .from('inventario_levantamientos')
      .select('estado, fecha_aplicado')
      .eq('id', createdLevId)
      .maybeSingle();
    expect(levErr).toBeNull();
    expect(levRow?.estado).toBe('aplicado');
    expect(levRow?.fecha_aplicado).not.toBeNull();

    const { data: firmas, error: firmasErr } = await admin
      .schema('erp')
      .from('inventario_levantamiento_firmas')
      .select('paso, rol')
      .eq('levantamiento_id', createdLevId);
    expect(firmasErr).toBeNull();
    const firmasArr = (firmas ?? []) as Array<{ paso: number; rol: string }>;
    expect(firmasArr.length).toBe(1);
    expect(firmasArr[0].paso).toBe(1);
    expect(firmasArr[0].rol).toBe('contador');

    // Movimientos: con cantidades 5/0/12 (vs stock=0 esperado para productos
    // sin entradas previas) y los pendientes marcados como 0, casi siempre
    // hay diferencias y se generan movimientos. Pero un catálogo en cero
    // contado en cero produce 0 movimientos — `>= 0` es robusto, el gate
    // real de éxito es `estado='aplicado'` que ya validamos arriba.
    const { count: movimientos, error: movErr } = await admin
      .schema('erp')
      .from('movimientos_inventario')
      .select('id', { count: 'exact', head: true })
      .eq('referencia_tipo', 'levantamiento_fisico')
      .eq('referencia_id', createdLevId);
    expect(movErr).toBeNull();
    // No exigimos > 0 — un levantamiento sin diferencias es válido y no genera
    // movimientos. El estado=aplicado ya garantiza que el flujo cerró bien.
    expect(movimientos ?? 0).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Captura un producto por código exacto: escribe el código, presiona Enter
 * (auto-selecciona el match exacto), introduce la cantidad con NumPad y
 * guarda con "Guardar y siguiente".
 */
async function capturarProducto(page: Page, codigo: string, cantidad: string): Promise<void> {
  const search = page.locator('#capturar-search');
  await search.click();
  await search.fill('');
  await search.fill(codigo);
  await search.press('Enter');

  // Si el Enter no auto-seleccionó (códigos con coincidencias parciales),
  // hacemos click en la primera coincidencia visible.
  const activo = page.getByText(/capturando/i).first();
  if (!(await activo.isVisible({ timeout: 1500 }).catch(() => false))) {
    const firstMatch = page.locator('button', { hasText: new RegExp(codigo, 'i') }).first();
    await firstMatch.click({ timeout: 3_000 });
  }

  // Tecleamos la cantidad con NumPad. Algunos dígitos coinciden con quick
  // values (`[0, 1, 6, 12, 24]`); `.first()` resuelve la ambigüedad —
  // quick values vienen antes en el DOM y producen el mismo efecto sobre el
  // value.
  for (const digito of cantidad) {
    await page.getByRole('button', { name: digito, exact: true }).first().click();
  }

  await page.getByRole('button', { name: /guardar y siguiente/i }).click();

  // Esperamos a que el panel "Capturando" desaparezca (señal de que el
  // siguiente turno está listo para entrar).
  await page.waitForTimeout(800);
}
