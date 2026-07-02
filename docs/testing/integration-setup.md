# Integration testing setup

> Establecido en Sprint 3C de `tech-debt-h1-2026`; promovido a **CI** en
> `blindaje-financiero` S2. Pipeline de tests contra una **DB real**
> (Supabase local stack / shadow) que detecta drift de RPCs PL/pgSQL, RLS
> policies, triggers y constraints. Los unit tests con mocks no detectan
> estas regresiones — los integration tests sí.

## Cuándo corren

- **En CI, automáticamente** (desde `blindaje-financiero` S2): el workflow
  `schema-check.yml` corre `npm run test:integration` contra la shadow DB en
  todo PR que toca `supabase/migrations/`, los derivados
  (`SCHEMA_REF`/`FUNCTIONS_REF`), los generadores, `tests/integration/` o el
  config. La shadow ya está arriba en ese job — la suite agrega ~1s.
- **Local, antes de push** en PRs que tocan migraciones o código financiero:
  `supabase start && npm run test:integration`.

## Pre-requisitos (local)

1. **Docker** corriendo (OrbStack recomendado en Mac: `brew install --cask orbstack`).
2. **Supabase CLI** ≥ 2.0 (`brew install supabase/tap/supabase`).
3. `npm ci`.

## Cómo correrlos

```bash
supabase start          # levanta el stack local y aplica las migraciones
npm run test:integration
```

Si el stack ya estaba corriendo con estado viejo (las migraciones nuevas no
se re-aplican a una stack viva): `supabase db reset`, o
`supabase stop --no-backup && supabase start` para reconstruir desde cero.

## Estructura

```
tests/integration/
├── helpers.ts                            # clientes (service/anon), fixtures
│                                         # financieras, usuarios auth con rol
├── smoke.integration.test.ts             # el pipeline está OK (stack, schemas, RPCs)
├── finanzas-cxc.integration.test.ts      # FIFO, cancelar revierte, re-aplicar,
│                                         # ajustar cargo, movimiento espejo
├── finanzas-cxp.integration.test.ts      # comprometido vivo, dedup uuid_sat,
│                                         # gate Dirección de cxp_pago_aprobar
└── perimetro-anon.integration.test.ts    # anon-negativo: RPCs de dinero = 42501
                                          # (red del Sprint 0 de la revisión 2026-06-12)
```

`vitest.integration.config.ts` usa `singleFork: true` — la DB es compartida
y paralelizar genera race conditions.

## Convenciones para tests nuevos

1. Archivo en `tests/integration/{feature}.integration.test.ts`.
2. Fixtures vía `helpers.ts` (`crearFixturesFinancieras` crea empresa/
   cliente/proveedor/cuenta con `runTag` único — las corridas no chocan
   entre sí y no hace falta cleanup: la shadow es desechable).
3. **Assertar comportamiento (saldos, estados, audit), no existencia.** El
   objetivo es que una migración que redefina mal una RPC truene aquí.
4. Para gates por rol: `crearUsuarioConRol` crea un usuario de auth REAL con
   `core.usuarios.id = auth.uid()` (requisito de `core.fn_user_has_role` y
   del FK de `core.audit_log`) y devuelve un cliente autenticado.
5. Para probar el perímetro: cliente `anonClient()` y assertar **42501 /
   permission denied** — un error de negocio significa que anon alcanzó el
   cuerpo de la función.
6. Las llaves hardcodeadas en `helpers.ts` son los JWTs demo públicos del
   CLI local (iss `supabase-demo`) — no son secrets.

## Troubleshooting

- **"Cannot connect to Docker daemon"** → abre OrbStack/Docker Desktop.
- **PGRST202 "function does not exist"** → migraciones sin aplicar:
  `supabase db reset`.
- **Un test financiero falla tras tocar una migración** → probablemente
  detectó exactamente lo que debe detectar: la RPC cambió de comportamiento.
  Compara el cuerpo contra `supabase/FUNCTIONS_REF.md` (fuente canónica) y
  decide si el cambio es intencional (actualiza el test) o una regresión
  (arregla la migración partiendo del cuerpo canónico).
- **Studio local**: http://localhost:54323 (`supabase status`).

## Referencias

- `docs/planning/blindaje-financiero.md` (S2) y
  `docs/strategy/REVISION-GENERAL-BSOP-2026-06-12.md` (hallazgo C5b).
- `supabase/GOVERNANCE.md` §3 (modelo shadow / derivados sin drift).
- [Supabase CLI docs](https://supabase.com/docs/guides/cli/local-development).
