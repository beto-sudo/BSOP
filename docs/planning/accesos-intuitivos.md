# Iniciativa — Accesos intuitivos (RBAC sin trampas)

**Slug:** `accesos-intuitivos`
**Empresas:** todas (la pantalla de Accesos es global; los catálogos de módulos son por empresa)
**Schemas afectados:** `core` (datos: `modulos.nombre/descripcion`; posible `rol_plantillas` en S3). El grueso es UI (`app/settings/acceso`) + un mapa de dependencias en `lib/`.
**Estado:** in_progress
**Próximo hito:** S3 — plantillas de rol (decisión de diseño pendiente con Beto: constantes vs `core.rol_plantillas`)
**Dueño:** Beto
**Creada:** 2026-06-11
**Última actualización:** 2026-06-11 (S2 entregado: rol obligatorio en el alta + badges de accesos sin rol)

## Problema

Configurar el acceso de un usuario nuevo requiere conocimiento arcano del
sistema. Caso real (Nelcy, 2026-06-11): Beto creó el rol, marcó permisos en la
matriz y la usuaria terminó viendo la empresa **sin ningún módulo**; tras el
primer fix, "Acceso restringido" al abrir Ventas. Tres fallas de diseño
distintas en una sola alta:

1. **Dependencias invisibles entre sub-permisos.** Tener `fase03_formalizada`
   sin `dilesa.ventas.lista` es un rol incoherente (puedes capturar la fase
   pero no abrir la lista ni el expediente que te llevan a ella). La matriz lo
   deja guardar sin avisar.
2. **Slugs que no hablan el idioma del negocio.** "Hacer asignaciones" =
   `dilesa.ventas.autorizar` (no `fase02_asignada`, que existe pero no gobierna
   esa pantalla). Ni el creador del sistema lo mapeó de memoria.
3. **Asignación rol→usuario a medias.** Se puede dar acceso a una empresa sin
   elegir rol (`usuarios_empresas.rol_id NULL`) y se ve igual que un acceso
   completo. Es exactamente lo que dejó a Nelcy sin módulos.

## Outcome

Dar de alta un usuario operativo toma minutos y queda bien a la primera:

- Marcar un permiso en la matriz arrastra automáticamente sus requisitos (con
  aviso visible de qué se agregó y por qué).
- La matriz habla negocio: nombre + descripción por sub-permiso, no slugs.
- No se puede guardar un acceso a empresa sin rol.
- (S3) Plantillas de rol de un click para los perfiles comunes.

## Alcance

### Dentro

- **S1a — Mapa de dependencias** `lib/permissions-deps.ts`: por sub-slug, qué
  otros slugs requiere (ej. `dilesa.ventas.autorizar` → `dilesa.ventas.lista`
  lectura + padre `dilesa.ventas`). Fuente de verdad única, con test que cruza
  contra `ROUTE_TO_MODULE`/`EXPECTED_DB_MODULE_SLUGS` para detectar slugs
  huérfanos o mal mapeados.
- **S1b — La matriz auto-marca requisitos** al activar un permiso (y avisa:
  "se agregó _Lista_ porque _Formalizar_ lo necesita"). Al guardar, validación
  de coherencia con el mismo mapa.
- **S1c — Naming de negocio**: migración de datos que puebla
  `core.modulos.nombre/descripcion` con etiquetas humanas por sub-slug
  ("Autorizar — capturar Fase 2: Asignada"); la matriz muestra
  nombre + descripción (slug como tooltip/detalle).
- **S2 — Rol obligatorio al dar acceso**: en `app/settings/acceso`, el alta
  usuario↔empresa exige rol en el mismo paso; los accesos existentes con
  `rol_id NULL` se reportan en la UI como incompletos (badge) para sanearlos.
- **S3 — Plantillas de rol**: presets nombrados ("Mesa de control DILESA" =
  lista + autorizar + fases 2-3; "Vendedor" = lista + fase 1; …) aplicables al
  crear rol. Definir si viven en constantes o en `core.rol_plantillas`.

### Fuera (por ahora)

- Rediseño del modelo RBAC (tablas/RLS quedan igual — esto es UX + datos de
  catálogo + validaciones).
- El aislamiento RLS por empresa de `erp.*` (iniciativa aparte, ya registrada
  como deuda Tier 1).
- Auditoría de permisos existentes de todos los roles (solo se sanean los
  `rol_id NULL` en S2).

## Riesgos

- **El mapa de dependencias se desactualiza** cuando se agregan páginas/slugs
  nuevos → mitigación: test de sync (mismo patrón que
  `EXPECTED_DB_MODULE_SLUGS`) que falla si un slug de `ROUTE_TO_MODULE` no
  tiene entrada (aunque sea vacía) en el mapa.
- **Auto-marcar permisos puede sobre-otorgar** si una dependencia se declara
  de más → las dependencias solo agregan _lectura_ del requisito, nunca
  escritura; la escritura siempre es decisión explícita.
- **Plantillas que divergen de los roles reales** → S3 al final, cuando S1/S2
  ya estabilizaron el vocabulario.

## Métricas de éxito

- Alta de un usuario operativo nuevo (rol + acceso + verificación) sin
  intervención de Claude ni SQL manual.
- Cero casos nuevos de "veo la empresa pero ningún módulo" / "Acceso
  restringido" por rol incoherente.

## Sprints

- **S1** — Dependencias automáticas + naming de negocio en la matriz (a+b+c).
- **S2** — Rol obligatorio en el alta + saneo de accesos `rol_id NULL`.
- **S3** — Plantillas de rol.

## Bitácora

- **2026-06-11:** Promovida por Beto tras el caso Nelcy (rol configurado pero
  sin ligar → empresa sin módulos; luego "Acceso restringido" por falta de
  `dilesa.ventas.lista`; "asignar" resultó ser `autorizar`). Los 3 fixes
  puntuales de Nelcy se aplicaron directo en prod ese día (UPDATE rol_id +
  permisos lista/autorizar al rol "Nelcy" DILESA).
- **2026-06-11 (S1):** `lib/permissions-deps.ts` (mapa sub-slug → requisitos,
  clausura transitiva) + 9 tests, incluido el test estructural que recorre los
  page.tsx reales y exige declarar la dependencia de toda página anidada bajo
  segmento dinámico (detecta "casos Nelcy" futuros en CI). La matriz auto-activa
  la lectura de los requisitos al otorgar un permiso (toast explica qué y por
  qué; la escritura nunca se otorga implícita; action batch
  `upsertPermisosRolBatch`) y ahora muestra la descripción de cada permiso
  (slug como tooltip). Migración `20260611171917` aplicada a prod: pulidas las
  5 descripciones confusas de Ventas (lista/autorizar/fase02/F09/F16).
  Hallazgo: las descripciones YA existían en `core.modulos` — el problema era
  que la matriz nunca las mostraba; S1c pasó de "poblar todo" a pulir 5.
- **2026-06-11 (S2):** Rol obligatorio al dar acceso usuario↔empresa. En el
  drawer de usuario, marcar "Tiene acceso a X" ya no guarda: abre un draft
  local que exige elegir rol antes de "Dar acceso" (si la empresa no tiene
  roles, lo dice y no deja confirmar). Server: `setUsuarioEmpresaAcceso` +
  `updateUsuarioEmpresaRol` reemplazadas por `grantUsuarioEmpresaAcceso`
  (upsert con rol validado server-side: existe y es de la empresa — la FK no
  lo garantiza) y `revokeUsuarioEmpresaAcceso` (con confirm en UI). La regla
  vive en `acceso-rules.ts` (helper puro + 6 tests, patrón `modulos-tree`).
  Accesos legacy con `rol_id NULL`: badge ámbar "Sin rol" en el chip de la
  tabla de usuarios y en el drawer + banner-resumen arriba de la tabla que
  nombra usuario → empresa; sanear = elegir rol en el mismo Combobox de
  siempre (que perdió `allowClear` — ya no se puede regresar a NULL).

## Decisiones registradas

- **2026-06-11:** Las dependencias entre sub-permisos viven en código
  (`lib/permissions-deps.ts`), no en DB: son propiedad de qué slug exige cada
  página (`RequireAccess`), cambian con el código y se validan con tests. Si
  algún día se requiere editarlas sin deploy, se migra a tabla.
- **2026-06-11:** El auto-marcado de dependencias agrega solo **lectura** del
  requisito; la escritura nunca se otorga implícitamente.
- **2026-06-11 (S2):** Alta y saneo son la misma operación
  (`grantUsuarioEmpresaAcceso` = upsert): dar acceso nuevo, cambiar rol y
  completar un acceso legacy sin rol pasan por la misma action validada. No
  quedó ninguna ruta de escritura que produzca `rol_id NULL`.
- **2026-06-11 (S2):** Los accesos `rol_id NULL` existentes se sanean desde la
  UI (banner + badge), **no** con migración de datos: elegir qué rol le toca a
  cada usuario es decisión humana, y el universo es chico.
