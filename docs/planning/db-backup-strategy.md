# Iniciativa — Estrategia de Respaldos (Supabase)

**Slug:** `db-backup-strategy`
**Empresas:** todas (BSOP es la DB compartida del portafolio)
**Schemas afectados:** todos (es protección DB-wide; los respaldos cubren `public`, `core`, `erp`, `rdb`, `health`, `playtomic`, `dilesa`, `maquinaria` y los que se agreguen)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-30
**Última actualización:** 2026-04-30

## Problema

Hoy BSOP corre con la red de seguridad mínima que da el plan Pro de Supabase: **daily backups automáticos retenidos 7 días**, restaurables 1-clic desde el dashboard. Eso cubre el caso "borré una tabla ayer" pero deja descubiertos riesgos reales para una operación que sostiene 5 empresas (ANSA, DILESA, COAGAN, RDB, Nigropetense) con datos de finanzas, RH, juntas, OC, recepciones, documentos legales:

1. **Granularidad de 24 horas.** Si un `UPDATE`/`DELETE` mal escrito corre a las 3pm y nos damos cuenta a las 5pm, perdemos todo lo capturado entre el último backup nocturno y el incidente. La pérdida típica diaria en operación activa es de decenas a cientos de filas (juntas, tareas, recepciones, transacciones).
2. **Retención de 7 días.** Si el daño se descubre tarde (ej. una migración rota que dañó datos hace 10 días pero solo afecta un módulo poco usado), el backup ya rotó.
3. **Cero respaldo fuera de Supabase.** Todos los respaldos viven en infra de Supabase. No estamos cubiertos contra:
   - Compromiso de la cuenta (alguien con acceso al dashboard puede borrar el proyecto + los backups internos).
   - Disputa o cierre inesperado de cuenta (billing, ToS, error operativo de Supabase).
   - Incidente operativo grave del proveedor (raro pero ha pasado: regiones caídas durante horas, restores lentos en queue).
4. **No hay protocolo de prueba de restauración.** Un backup que nunca se ha restaurado es solo una esperanza estadística — el primer restore real puede fallar por razones que no aparecen hasta intentarlo (extensión faltante, role no recreado, secrets dependientes).
5. **`pg_dump` local desactualizado** (v14 vs server v17). Si necesitamos hacer un dump manual de emergencia, primero hay que actualizar el cliente — fricción innecesaria en un momento de presión.

El costo de la cobertura actual es bajo. El costo del primer incidente sin cobertura adicional sería operativamente devastador para Beto y las 5 empresas.

## Outcome esperado

Tres niveles de protección, **acumulables**:

- **Nivel 1 — Verificación** (lo que ya está, validado): backups diarios de Supabase confirmados visibles en el dashboard, primer restore de prueba ejecutado y documentado, dump completo manual descargado al Synology como sanity check inicial. Tiempo de recuperación esperado (RTO) < 30 min para el escenario "borré una tabla ayer".
- **Nivel 2 — Respaldo externo automatizado**: script `npm run db:backup` que produce un dump completo (`pg_dump` con todos los schemas custom) cifrado, copiado a destino fuera de Supabase (Synology y/o Google Drive — Beto ya tiene ambos). Cron diario + retención escalonada (ej. 7 dailies, 4 weeklies, 3 monthlies). Cubre el escenario "perdí acceso al panel de Supabase" que el Nivel 1 no cubre. RTO sigue dependiendo del tamaño del dump (probablemente 15-60 min).
- **Nivel 3 — Point-in-Time Recovery (PITR)**: add-on Pro de Supabase (+$100/mes). Granularidad de 2 minutos, retención hasta 28 días según tier del add-on. Convierte el RPO (recovery point objective) de 24h a 2 min. Es la única forma de recuperar lo capturado entre el último backup y un incidente intra-día. Decisión pendiente de Beto según tolerancia al gasto vs. al riesgo.

## Alcance v1 (tentativo — cerrar al arrancar)

> **Estado `proposed`**: alcance no cerrado todavía. Cuando se promueva a `planned` se cierran las decisiones marcadas como **PENDIENTE** abajo.

- [ ] **Sprint 1 — Verificación (Nivel 1, 1 sesión corta)**:
  - Entrar al dashboard de Supabase → Database → Backups. Confirmar que hay 7 entries diarias.
  - Disparar un restore de prueba a una **base efímera** (no la de producción) para validar que el dump real es restaurable. Si Supabase no permite restore a otra DB, exportar el dump y restaurarlo en un Postgres local.
  - `brew install postgresql@17` (cliente local actualizado para futuros dumps manuales).
  - Hacer un dump manual completo (`pg_dump` con `--schema=public,core,erp,rdb,health,playtomic,dilesa,maquinaria` o `-N` excluyendo internos) y guardarlo cifrado en Synology como baseline de hoy. Documentar el comando exacto en el doc de la iniciativa.
  - Documentar en `docs/runbooks/db-restore.md` el procedimiento exacto para restore desde dashboard y desde dump manual (paso a paso, comandos copiables).

- [ ] **Sprint 2 — Script de backup externo (Nivel 2, ~2 hrs)**:
  - Script `scripts/db-backup.ts` (o `.sh`) que:
    - Lee `SUPABASE_DB_URL` del entorno seguro (1Password CLI).
    - Corre `pg_dump` con todos los schemas custom (lista canónica desde `supabase/config.toml` o `EXPECTED_DB_MODULE_SLUGS`).
    - Comprime + cifra (gpg con passphrase de 1Password, o `age` que es más simple).
    - Copia el output a destino(s) **PENDIENTE** decidir: ¿Synology vía SMB? ¿`rclone` a Google Drive? ¿Ambos? ¿Bucket S3 separado?
    - Aplica retención (borra dailies > 7 días, deja 4 weeklies y 3 monthlies).
    - Loguea status (éxito / error / bytes / duración) y notifica si falla — **PENDIENTE** elegir canal: ¿email? ¿Telegram bot? ¿solo log?
  - `npm run db:backup` agregado a `package.json`.
  - Cron — **PENDIENTE** decidir host: ¿Vercel cron (requiere endpoint público con auth)? ¿Synology Task Scheduler? ¿Mac mini local? Probablemente Synology para no depender del laptop de Beto.
  - Smoke: correr el script una vez manualmente y restaurar el output en una DB local para confirmar que el dump es íntegro.
  - Test de regresión: cron disparado en preview/staging que valida que el job corrió las últimas 24h (alerta si lleva >36h sin nuevo backup).

- [ ] **Sprint 3 — Decisión y posible activación de PITR (Nivel 3, 5 min si se aprueba)**:
  - Calcular costo anual ($1,200/año add-on PITR) vs. valor estimado de los datos capturados intra-día.
  - Decisión de Beto: activar / postergar / descartar.
  - Si se activa: configurar retention window y documentar el procedimiento de PITR en `docs/runbooks/db-restore.md` (es distinto al restore de daily backups).

- [ ] **Sprint 4 — Test de DR (disaster recovery) end-to-end (cierre)**:
  - Simular pérdida total: levantar un proyecto Supabase nuevo (efímero, en branch separado o usando `supabase start` local) y restaurar **desde el dump externo del Synology** — sin usar nada de la cuenta Supabase original. Mide el tiempo real de recuperación (RTO observado).
  - Documentar resultados en bitácora.
  - Si el RTO observado es inaceptable (ej. >2h), iterar antes de cerrar.

## Fuera de alcance v1

- **Réplica streaming a otro Postgres** (ej. RDS read-replica, Crunchy Bridge mirror). Sobre-ingeniería para nuestro tamaño actual. Si el negocio crece a punto de no tolerar 30 min de downtime, se reevalúa.
- **Backup de Supabase Storage (archivos adjuntos)**. Lo manejará una iniciativa separada (`storage-backup-strategy`) si los blobs en `erp.adjuntos`/`erp.documentos`/etc. crecen lo suficiente. Hoy son volumen bajo y los originales suelen estar en Drive/Coda histórico. **Nota:** revisar tamaño actual de Storage en Sprint 1 para confirmar que sigue siendo despriorizable.
- **Encriptación con KMS administrado** (AWS KMS, GCP KMS). v1 usa passphrase de 1Password — suficiente para nuestra escala. Migrar a KMS si la operación crece a punto de manejar datos regulados (PII médica, datos financieros sensibles más allá de los actuales).
- **Backup de auth.users / vault secrets de Supabase**. `pg_dump` no captura el schema interno `auth` por default, y los vault secrets viven en `vault.secrets`. Decidir en Sprint 1 si se incluyen explícitamente o se documenta como limitación conocida (los recreamos manualmente en caso de DR si nunca son muchos).
- **GitOps de schema completo** (`pg-schema-diff` + reverso desde `migrations/`). Las migraciones ya están versionadas en `supabase/migrations/`, así que la estructura es recuperable; lo que protege esta iniciativa son los **datos**.

## Riesgos

- **El dump externo crece sin freno**. Una DB de 2GB hoy con 30 dailies + 8 weeklies + 12 monthlies = ~100GB en Synology al año. Mitigación: retención agresiva inicialmente; revisar después de 60 días si las weeklies/monthlies se justifican.
- **El passphrase de cifrado se pierde**. Si Beto pierde el passphrase del backup cifrado, los dumps son irrecuperables. Mitigación: passphrase guardada en 1Password con respaldo en familia / abogado / otro vault offline.
- **Cron silenciosamente roto**. Un backup que falla 30 días sin alerta es peor que no tener backup (genera falsa seguridad). Mitigación: monitor de "último backup exitoso" + alerta si lleva >36h sin job verde.
- **PITR no cubre lo que DDL destruye irrecuperablemente** (ej. `DROP SCHEMA core CASCADE` aplicado por error). PITR puede recuperar un punto antes del DROP, pero el restore reescribe la DB completa — operación cara y disruptiva. Mitigación: protocolo de migraciones (PR + CI + Beto aplica con `psql` en BEGIN/COMMIT, ya documentado en `CLAUDE.md` y `supabase/GOVERNANCE.md`).
- **Cuello de botella en `pg_dump` durante backup nightly**. Para una DB chica (<5GB) el dump tarda minutos; para una de 50GB+ podría impactar IO. Mitigación: medir en Sprint 2 y agendar el cron en horario no-operativo (3-5am).

## Métricas de éxito

- **RPO** (recovery point objective): tiempo máximo de captura perdida en peor caso. Hoy: 24h. Meta v1 con Niveles 1+2: 24h (sin mejora real al RPO porque ambos hacen daily). Meta v1 con Nivel 3 activo: **2 min**.
- **RTO** (recovery time objective): tiempo desde decidir restaurar hasta DB operativa. Hoy: desconocido (nunca probado). Meta v1: **<60 min** medido en Sprint 4.
- **Cobertura de escenarios de pérdida**:
  - "Borré una tabla ayer" → cubierto desde hoy (Pro daily backups).
  - "Borré una tabla hoy a las 3pm" → cubierto **solo** con Nivel 3 (PITR) o Nivel 2 si el cron corrió hoy temprano.
  - "Perdí acceso al dashboard de Supabase" → cubierto desde Sprint 2 cierre (Nivel 2).
  - "Supabase mismo tuvo un incidente operativo grave" → cubierto desde Sprint 2 cierre (Nivel 2).
- **Ejecuciones consecutivas exitosas del cron** después del cierre: meta ≥30 días sin fallo silente.

## Decisiones registradas

- **2026-04-30** — **Estado actual confirmado**: plan Pro activo (org `iemyeatvuhdkidyftpoy`, "BSOP"), región `us-east-1`, Postgres 17.6.1.104. Daily backups automáticos retenidos 7 días incluidos. PITR NO activado. No existe ningún script de respaldo propio en el repo (`scripts/`, `package.json` revisados). Razón del registro: línea base para medir mejora.

## Decisiones pendientes (cerrar al promover a `planned`)

- **D1**: ¿Destino del dump externo? Synology (ya está), Google Drive vía `rclone`, o ambos. Recomendación: ambos para no poner todos los huevos en una canasta de hardware on-prem.
- **D2**: ¿Host del cron? Synology Task Scheduler (auto-suficiente), Vercel cron (require endpoint), Mac mini local (frágil si se apaga). Recomendación: Synology.
- **D3**: ¿Cifrado con `gpg` o `age`? Recomendación: `age` por simplicidad de gestión de llaves.
- **D4**: ¿Canal de alerta si el cron falla? Email a Beto, mensaje Telegram, ambos. Recomendación: Telegram (Beto ya tiene bot configurado en infra) + email de respaldo.
- **D5**: ¿Activar PITR ya, o decidir después de Sprint 2 con datos del costo real? Recomendación: postergar la decisión a Sprint 3 con métricas reales de RPO observado.
- **D6**: ¿Incluir `auth.users` y `vault.secrets` en el dump? Recomendación: incluir `auth.users` (usuarios y password hashes); excluir `vault.secrets` (los recreamos manualmente, son pocos).
- **D7**: ¿Storage backup en alcance separado o se incluye? Recomendación: separar a `storage-backup-strategy` solo si Storage > 1GB en Sprint 1; de otro modo incluir en este alcance.

## Bitácora

- **2026-04-30** — Iniciativa creada. Origen: Beto preguntó si tenía respaldos y qué hacer ante posible pérdida/corrupción. Análisis completado en sesión: confirmado plan Pro, ausencia de scripts propios, riesgos identificados. Beto dio el "promovela" para atacarlo después; alcance queda en `proposed` con decisiones pendientes documentadas (D1-D7) para cerrar cuando se retome.
