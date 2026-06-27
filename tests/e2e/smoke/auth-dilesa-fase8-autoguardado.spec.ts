/**
 * E2E — DILESA › Fase 8 (Dictaminada) · autoguardado de campos (ADR-051 D5).
 *
 * Verifica la PERSISTENCIA del autoguardado de la fase 8 (no solo que la ruta
 * carga, que es lo que cubre `auth-dilesa-captura-fases`): que teclear un campo
 * del dictamen dispara el UPDATE correcto a `dilesa.ventas` con el valor tecleado.
 *
 * ── CERO ESCRITURA EN PROD (decisión Beto 2026-06-26) ───────────────────────
 * El harness corre contra PROD. Este test NO escribe: intercepta toda escritura a
 * `dilesa.ventas` con `page.route` y la responde MOCKEADA (204) — el PATCH del
 * autoguardado nunca llega a la DB. Las lecturas (GET) pasan normales, así que el
 * form se monta con datos reales. No hay restore que pueda fallar: la limpieza es
 * por diseño (nada se persiste). Ver memoria `feedback_e2e_tests_auto_limpiantes`.
 *
 * Qué prueba exactamente: que el hook `useAutoguardadoCampos` de la fase 8, con el
 * gate `!yaCerrada || esDireccion`, dispara el UPDATE de los 6 campos financieros
 * cuando un rol NO-Dirección (el bot, como Gerencia) teclea en el form de cierre.
 * La persistencia física en Postgres no se ejercita (es responsabilidad de
 * Supabase y ya está probada idéntica en las otras 8 fases en prod).
 *
 * ── REQUISITOS PARA CORRER ──────────────────────────────────────────────────
 * 1. `.env.test.local` con TEST_USER_EMAIL/PASSWORD del bot (ver
 *    `reference_e2e_harness_bsop`) y `E2E_DILESA_VENTA_F8_ID` = id de una venta
 *    con la fase 8 ABIERTA (fase 7 cerrada, 8 no). Sin el id → el test se salta.
 * 2. Grant TEMPORAL de escritura al bot en la fase 8 (el form está gated con
 *    `RequireAccess … write`; sin grant el bot ve "Acceso restringido" → skip).
 *    El bot por defecto tiene 0 escritura — el grant es just-in-time y se revierte:
 *
 *      -- otorgar (antes de correr):
 *      UPDATE core.permisos_rol SET acceso_escritura = true
 *      WHERE rol_id   = (SELECT r.id FROM core.roles r
 *                        JOIN core.usuarios_empresas ue ON ue.rol_id = r.id
 *                        JOIN core.usuarios u ON u.id = ue.usuario_id
 *                        WHERE u.email = 'e2e-bot@bsop.test' AND r.nombre = 'E2E (lectura)')
 *        AND modulo_id = (SELECT id FROM core.modulos WHERE slug = 'dilesa.ventas.fase08_dictaminada');
 *
 *      -- revertir (después de correr): igual, con acceso_escritura = false.
 *
 *    Con el approach mock el bot NUNCA ejerce el write — el grant solo monta el
 *    form. Por eso es temporal: el estado seguro del bot es 0 escritura.
 *
 * Run: npm run test:e2e:auth -- --grep "Fase 8 . autoguardado"
 */

import { test, expect } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

const VENTA_ID = process.env.E2E_DILESA_VENTA_F8_ID;
// Valor de prueba identificable; nunca se persiste (el PATCH se mockea).
const VALOR = 'E2E-AUTOSAVE-CHECK';
const CAMPO = 'credito_cotitular_ref';
// Los 6 campos financieros que el autoguardado de la fase 8 manda en cada UPDATE.
const CAMPOS_DICTAMEN = [
  'valor_escrituracion',
  'gastos_escrituracion',
  'monto_credito_titular',
  'monto_credito_cotitular',
  'credito_titular_ref',
  'credito_cotitular_ref',
];

test.describe('DILESA › Fase 8 · autoguardado (persistencia, mock del PATCH)', () => {
  test('teclear un campo dispara el UPDATE del autoguardado a dilesa.ventas', async ({
    page,
  }, testInfo) => {
    skipIfNoAuth(testInfo);
    if (!VENTA_ID) {
      testInfo.skip(
        true,
        'Falta E2E_DILESA_VENTA_F8_ID (venta con la fase 8 abierta) en .env.test.local'
      );
    }

    // Cero escritura: cualquier escritura a `dilesa.ventas` se captura y se mockea
    // (204) — nunca toca la DB. Registrado ANTES de navegar para que ni una
    // precarga automática (p.ej. gastos notariales) llegue a prod. GET pasa.
    const patched: Array<Record<string, unknown>> = [];
    await page.route('**/rest/v1/ventas*', async (route) => {
      const method = route.request().method();
      if (method === 'GET' || method === 'HEAD') {
        await route.continue();
        return;
      }
      if (method === 'PATCH') {
        try {
          patched.push(route.request().postDataJSON() as Record<string, unknown>);
        } catch {
          /* PATCH sin body parseable — lo ignoramos, igual no lo dejamos pasar */
        }
      }
      await route.fulfill({ status: 204, body: '' });
    });

    await page.goto(`/dilesa/ventas/${VENTA_ID}/capturar/8-dictaminada`);
    await page.waitForTimeout(1500);
    if (page.url().includes('/login')) {
      testInfo.skip(true, 'sesión no aceptada (cookies SSR) o e2e-bot sin acceso a DILESA');
    }

    // Sin el grant de escritura el gate `RequireAccess … write` muestra esto.
    if ((await page.getByText('Acceso restringido').count()) > 0) {
      testInfo.skip(
        true,
        'e2e-bot sin write en dilesa.ventas.fase08_dictaminada — otorga el grant temporal (ver header)'
      );
    }

    // El form de cierre solo se monta con la fase 7 cerrada y la 8 abierta. Si la
    // venta ya avanzó (o no es ese estado), el input no aparece → skip.
    const input = page.getByPlaceholder('Si no hay co-titular, déjalo en blanco').first();
    if (!(await input.isVisible({ timeout: 8000 }).catch(() => false))) {
      testInfo.skip(
        true,
        `la venta ${VENTA_ID} no muestra el form de cierre de fase 8 (¿ya avanzó? actualiza el id)`
      );
    }

    // Teclear → el autoguardado (debounce ~700 ms) dispara el UPDATE.
    await input.fill(VALOR);

    // Aserción dura: llegó un UPDATE con el valor tecleado.
    await expect
      .poll(() => patched.some((b) => b?.[CAMPO] === VALOR), {
        timeout: 8000,
        message: 'el autoguardado no disparó un UPDATE a dilesa.ventas con el valor tecleado',
      })
      .toBe(true);

    // Y ese UPDATE es el del autoguardado: trae los 6 campos del dictamen juntos
    // (no una escritura suelta de otra parte del form).
    const body = patched.find((b) => b?.[CAMPO] === VALOR)!;
    for (const k of CAMPOS_DICTAMEN) {
      expect(Object.keys(body), `el UPDATE del autoguardado debe incluir ${k}`).toContain(k);
    }

    // Señal de UI (best-effort): el indicador llega a "Guardado".
    await expect(page.getByText('Guardado', { exact: true }).first())
      .toBeVisible({ timeout: 3000 })
      .catch(() => {});
  });
});
