# Iniciativa — Recordatorios de vencimiento + forecast de cobranza (DILESA)

**Slug:** `dilesa-cobranza-recordatorios`
**Empresas:** DILESA
**Schemas afectados:** `core.notificaciones` (catálogo de recordatorios de cobranza), lectura de `erp.cxc_cargos` (vencidos, `fuente_esperada='cliente'`); sin DDL nuevo previsto más allá del catálogo.
**Estado:** proposed
**Próximo hito:** Que Beto la promueva (decisión suya). Es el Sprint 4 descopeado de [`cxc`](cxc.md).
**Dueño:** Beto
**Creada:** 2026-06-28
**Última actualización:** 2026-06-28 (propuesta — descope de CxC v1 Sprint 4)

## Problema

CxC v1 (ver [`cxc`](cxc.md)) entregó schema, captura, módulo Cobranza, aging
por buckets y printables. Lo que NO entró: la **cobranza activa proactiva** —
hoy el aging muestra los vencidos pero nadie avisa al cliente ni hay visión de
lo que entra a futuro. Se descopeó de v1 para cerrar la iniciativa madre sin
arrastrarla.

## Outcome esperado

- **Recordatorios de vencimiento por email**, **solo `fuente='cliente'`** (a
  institución no se le cobra; es solo visibilidad del adeudo). Branding por
  empresa vía `lib/juntas/email.ts`. Catálogo en `core.notificaciones`.
- **Forecast de cobranza**: lo que entra por fecha (el inverso del calendario
  de pagos de CxP). Bandeja/vista en `/dilesa/cobranza`.
- **Confirmar emisión de `movimientos_bancarios`** al cobrar (gancho con
  [`conciliacion-bancaria`](conciliacion-bancaria.md)).

## Alcance (borrador, a refinar al promover)

- [ ] Catálogo `core.notificaciones` para recordatorios de cobranza + plantilla
      de email con branding por empresa.
- [ ] Cron / disparador de recordatorios sobre cargos vencidos `fuente='cliente'`.
- [ ] Forecast de cobranza por fecha en el módulo Cobranza.
- [ ] Verificación del gancho de movimiento bancario al cobrar.

## Fuera de alcance

- Cobranza a instituciones (INFONAVIT/FOVISSSTE): solo visibilidad, como en v1.
- Interés moratorio (sigue diferido a V2 de CxC).

## Notas

Descopeada de `cxc` el 2026-06-28 (decisión de Beto: cerrar CxC v1 ya). Vive
como `proposed` hasta que Beto la promueva.
