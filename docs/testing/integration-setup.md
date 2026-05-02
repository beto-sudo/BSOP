# Integration testing setup

> Establecido en Sprint 3C de `tech-debt-h1-2026`. Pipeline de tests
> contra una **DB real** (Supabase local stack) que detecta drift de
> RPCs PL/pgSQL, RLS policies, triggers y constraints. Los unit tests
> con mocks no detectan estas regresiones — los integration tests sí.

## Cuándo correrlos

- **Antes de mergear PRs** que tocan migrations (`supabase/migrations/`).
- **Antes de mergear PRs** que tocan código financiero
  (`app/rdb/cortes/`, `app/rdb/inventario/levantamientos/`,
  `app/rdb/productos/recetas/`).
- **Periódicamente** sobre `main` para confirmar que la DB local
  reproduce el schema de producción.

No corren en CI default (Sprint 3C los dejó opt-in para no penalizar
el tiempo de CI). Si más adelante decidimos escalar a CI nightly o
gate por archivo, se documenta el cambio en este archivo.

## Pre-requisitos

1. **Docker** corriendo. Cualquiera funciona:
   - [OrbStack](https://orbstack.dev/) (recomendado para Mac, más
     liviano: `brew install --cask orbstack`).
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. **Supabase CLI** ≥ 2.0:
   ```bash
   brew install supabase/tap/supabase
   supabase --version
   ```
3. El repo clonado y dependencias instaladas (`npm ci`).

## Cómo correrlos

### Workaround inicial (chicken-egg con schemas)

Hay un detalle del setup: nuestro `supabase/config.toml` declara
`api.schemas = ["public", "core", "erp", ...]` para que producción
exponga esos schemas vía PostgREST. Pero localmente, antes de aplicar
migrations, esos schemas no existen — y `supabase start` falla
porque PostgREST no puede cargar el schema cache.

**Bootstrap inicial** (una sola vez por máquina o tras `supabase stop --no-backup`):

```bash
# 1) Edita supabase/config.toml temporalmente: cambia
#    `schemas = ["public", "core", ...]` a `schemas = ["public"]`.

# 2) Levanta el stack local (primera vez ~5-10 min descargando
#    ~2GB de imágenes; las siguientes ~10-15 segundos).
supabase start

# 3) Aplica las 211 migrations — ahora los schemas core/erp/etc
#    se crean en la DB local.
supabase db reset

# 4) Restaura supabase/config.toml a la lista completa de schemas.

# 5) Restart de PostgREST para que recoja los schemas nuevos.
supabase stop  # SIN --no-backup, preserva el DB con migrations
supabase start

# 6) Ya puedes correr los integration tests.
npm run test:integration
```

### Uso normal (después del bootstrap)

```bash
supabase start          # 10-15s — DB persiste entre stop/start sin --no-backup
npm run test:integration
```

### Reset clean

```bash
supabase stop --no-backup   # destruye el DB volume
# Después tienes que repetir el bootstrap completo arriba.
```

Para detener:

```bash
supabase stop
# o `supabase stop --no-backup` si no quieres preservar el state.
```

## Estructura

```
tests/integration/
├── smoke.integration.test.ts       # Valida que el pipeline está OK.
└── (futuros tests aquí)
```

`vitest.integration.config.ts` usa `singleFork: true` para que los
tests corran serialmente — la DB es compartida y paralelizar genera
race conditions con SELECT/INSERT del mismo registro.

## Troubleshooting

### `supabase start` falla con "Cannot connect to Docker daemon"

Docker no está corriendo. Abre OrbStack/Docker Desktop primero.

### `supabase start` cuelga descargando

Primera vez tarda. Si lleva >15 min sin avanzar, `supabase stop` y
re-intentar.

### Tests fallan con "PGRST202: function does not exist"

Las migrations no se aplicaron al DB local. Corre:

```bash
supabase db reset
```

### El smoke test pasa pero un test específico falla

Probable drift del schema entre producción y migrations: alguna RPC
en producción se modificó sin migration. Investigar con
`supabase/SCHEMA_REF.md` y comparar con la signature que el RPC tenía
cuando el test fue escrito.

### Quiero ver el state actual de la DB local

```bash
# Studio (UI web) en http://localhost:54323
supabase status
```

## Cómo agregar tests nuevos

1. Archivo en `tests/integration/{feature}.integration.test.ts`.
2. Import del cliente desde el archivo (los defaults de `supabase
start` están en el smoke test como referencia).
3. **Cleanup obligatorio entre tests**: usa `beforeEach` para
   resetear el state que tu test necesita. La DB persiste entre
   tests del mismo run.
4. **Sin paralelismo**: el config force-a `singleFork`. Si tu test
   asume serialidad, está bien.
5. **Usar service role key** para crear fixtures (no necesitas auth
   real para validar lógica DB). Si tu test específicamente prueba
   RLS, usa anon key + JWT generado.

## Referencias

- Sprint 3C de `tech-debt-h1-2026` (planning doc).
- ADR pendiente: documentar este setup en
  `docs/adr/NNNN_integration_testing.md` cuando el patrón se
  estabilice tras 2-3 sprints de uso.
- [Supabase CLI docs](https://supabase.com/docs/guides/cli/local-development).
