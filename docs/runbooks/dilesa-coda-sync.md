# Runbook — DILESA Coda → BSOP sync

> **APAGADO como daily desde 2026-06-11** (cutover de ventas, S6 de
> `dilesa-ventas-expediente`): BSOP es master y Coda quedó read-only de
> consulta. Construcción ya se había cortado el 2026-06-09. El workflow
> queda **solo manual** (workflow_dispatch) para traer rezagos puntuales.
>
> Historia: fue el cron diario que refrescó el schema `dilesa` desde Coda
> durante la transición. Idempotente: ventas creadas nativas en BSOP
> (sin `coda_row_id`) se preservan; adjuntos se descargan solo si son
> nuevos.

## Setup inicial (one-time)

Antes del primer run hay que cargar 5 secrets en GitHub:

1. **GitHub → Settings → Secrets and variables → Actions → New secret**, agregar uno por uno:

   | Secret                      | Valor                     | Cómo obtenerlo                                                                                                               |
   | --------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
   | `CODA_API_KEY`              | El token de Coda          | `op read "op://Infrastructure/CODA_API_KEY/credential"`                                                                      |
   | `NEXT_PUBLIC_SUPABASE_URL`  | URL del proyecto Supabase | `op read "op://Infrastructure/NEXT_PUBLIC_SUPABASE_URL/credential"` (si existe) o `grep NEXT_PUBLIC_SUPABASE_URL .env.local` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role              | `op read "op://Infrastructure/SUPABASE_SERVICE_ROLE_KEY/credential"`                                                         |
   | `RESEND_API_KEY`            | API key de Resend         | `op read "op://Infrastructure/RESEND_API_KEY/credential"`                                                                    |
   | `NOTIFY_EMAIL`              | `beto@anorte.com`         | Hardcoded                                                                                                                    |

2. **Opcional** — `SYNC_FROM_EMAIL`. Default `BSOP Sync <onboarding@resend.dev>` (dominio reservado de Resend que funciona con cualquier API key). Para usar un dominio propio (más pro: `BSOP Sync <sync@anorte.com>` o `noreply@bsop.io`):
   1. Verifica el dominio en Resend → Domains → Add Domain → agregar los DNS records que Resend te da
   2. Carga el secret: `printf 'BSOP Sync <sync@tudominio.com>' | gh secret set SYNC_FROM_EMAIL -R beto-sudo/BSOP`

3. Verifica vía CLI:
   ```bash
   gh secret list -R beto-sudo/BSOP | grep -E "CODA_API_KEY|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|NOTIFY_EMAIL"
   ```

## Operación normal

- **Horario**: ya no hay — el `schedule:` se quitó el 2026-06-11 (cutover
  de ventas). Solo corre manual. (Histórico: `0 9 * * *` UTC = 03:00 CST.)
- **Email**: recibirás un correo a `$NOTIFY_EMAIL` con asunto:
  - `✓ Sync DILESA Coda→BSOP — <fecha>` si todo OK
  - `✗ Sync DILESA Coda→BSOP FALLÓ — <fecha>` si algún paso truena
- **Contenido del email**: conteos pre/post por tabla (con delta), duración por paso, y output de las últimas 4KB de cada paso fallido.

## Correr manualmente

Desde la UI: **Actions → DILESA Coda Sync → Run workflow → main**.

O desde CLI:

```bash
gh workflow run dilesa-coda-sync.yml -R beto-sudo/BSOP
gh run watch -R beto-sudo/BSOP
```

## Qué hace exactamente

Corre los 5 scripts en serie (orden importa):

1. `import_dilesa_terrenos.ts` — UPSERT terrenos. Idempotente.
2. `import_dilesa_proyectos.ts` — UPSERT proyectos. Idempotente.
3. `import_dilesa_inventario.ts` — UPSERT unidades + productos (prototipos). Idempotente.
4. `import_dilesa_ventas.ts` — **DELETE+INSERT solo de ventas con `coda_row_id NOT NULL`**. Preserva ventas nativas BSOP. Re-inserta personas con dedup por CURP válido + cleanup de personas-basura.
5. `import_dilesa_expediente.ts` — INSERT-only de adjuntos nuevos. Dedup por `metadata->>'coda_source_url'`. Match venta vía `coda_row_id` 1:1.

Wrapper [`scripts/run-dilesa-sync.ts`](../../scripts/run-dilesa-sync.ts):

- Toma snapshot de counts antes/después
- Corre cada script con `spawn`, captura stdout/stderr
- Manda email con resumen y stats (siempre, OK o fallo)
- Exit code 1 si algún paso falló (el job de GH queda rojo)

## Troubleshooting

### Email no llega

- Verifica `gh secret list` — los 5 secrets están seteados.
- Revisa el log del workflow — la última línea debe decir `✔ Email enviado a ...`.
- Si dice `✗ Resend error 4xx` (típico 422 "The domain is invalid") — el dominio del `from:` no está verificado en Resend. Default es `onboarding@resend.dev` que siempre funciona. Si overrideaste `SYNC_FROM_EMAIL`, asegúrate que ese dominio esté verificado.

### El job toma > 45 min

Cap configurado en el workflow. Si pega con frecuencia:

- Probable: el expediente está descargando muchos archivos nuevos (Coda recibió bulk).
- Inspeccionar: el output del paso "Expediente" en GH Actions — busca línea `Pendientes a procesar: N`.
- Solución: subir `timeout-minutes` en el workflow o ejecutar manualmente fuera del cron.

### `Pagos en alcance: 0` o `Ventas en alcance: 0`

Bug del query `.in()` con > ~200 UUIDs (URL > 8KB → Cloudflare 400). Ya está arreglado en el script actual (`scripts/import_dilesa_expediente.ts` usa `.eq('empresa_id')` + filtro JS). Si reaparece, ver memoria `feedback_supabase_in_url_limit.md`.

### Conteos bajan inesperadamente (ventas, adjuntos)

- Ventas bajan: alguien borró cosas en Coda. Verificar con el equipo de DILESA.
- Adjuntos bajan: NO debería pasar (script es INSERT-only). Si pasa, alguien borró rows manualmente en `erp.adjuntos`. Auditar.

### El cron corre pero no hace nada

- Verifica que el secret `CODA_API_KEY` no haya expirado (Coda los rota periódicamente).
- Verifica que el branch esté en `main` (cron solo corre en main).

## Estado del cutover (2026-06-11)

El cutover llegó: BSOP = autoritativo, Coda freezeado read-only (accesos de
escritura retirados al equipo). El `schedule:` se quitó del workflow; el
último sync daily corrió manualmente ese día con paridad verificada
(iniciativa `dilesa-ventas-expediente` § S6).

Si aparece captura vieja en Coda que haya que traer: corre el workflow
manual (ver "Correr manualmente" arriba) — sigue siendo idempotente y las
ventas nativas BSOP se preservan. **Cuidado**: el modo daily pisa los campos
mapeados de ventas con coda_row_id; si en BSOP ya se editaron esas ventas
post-cutover, lo de BSOP se pierde. Antes de correrlo, confirma que nadie
haya editado en BSOP las ventas que vienen de Coda.
