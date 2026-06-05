-- Hub de Compras (P2P) para DILESA: umbrella `dilesa.compras` + 3 sub-slugs por
-- tab (ADR-030). Sprint 2 fase A de la iniciativa `dilesa-compras`.
--
-- El hub /dilesa/compras tiene 3 tabs routed (Órdenes / Requisiciones /
-- Recepciones). El umbrella es la entry del sidebar (ADR-030 D3); cada sub-slug
-- gobierna el acceso real a su tab (RoutedModuleTabs filtra las que no tienen
-- permiso; cada sub-page monta su <RequireAccess modulo="...">).
--
-- Modelo constructora-first (D7/D10–D13): las líneas se anclan a concepto +
-- partida de presupuesto (`erp.conceptos_compra` / `erp.presupuesto_partidas`),
-- NO a producto/almacén; la recepción devenga contra la partida sin inventario.
--
-- Backfill defensivo: como el umbrella es NUEVO (no hay permisos del padre que
-- clonar), se clonan los permisos de un módulo DILESA existente y adyacente
-- (`dilesa.construccion.costeo` — el lado de presupuesto del mismo dominio) a
-- los 4 slugs nuevos, por cada rol. Así quien hoy opera Costeo ve Compras y
-- nadie pierde acceso; el ajuste fino por rol lo hace Beto después
-- (ver memoria reference_roles_por_empresa: gates operativos por rol Dirección).

BEGIN;

-- 1. Slugs nuevos (umbrella + 3 tabs). `seccion='operaciones'` como construcción.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT v.slug, v.nombre, v.descripcion, d.id, 'operaciones'
FROM (SELECT id FROM core.empresas WHERE slug = 'dilesa') d
CROSS JOIN (
  VALUES
    (
      'dilesa.compras',
      'Compras',
      'Ciclo de compras P2P (requisición → orden de compra → recepción) anclado al presupuesto por partidas'
    ),
    (
      'dilesa.compras.ordenes',
      'Compras · Órdenes',
      'Órdenes de compra ancladas a concepto + partida; al enviarse comprometen el presupuesto'
    ),
    (
      'dilesa.compras.requisiciones',
      'Compras · Requisiciones',
      'Solicitudes de compra previas a la orden'
    ),
    (
      'dilesa.compras.recepciones',
      'Compras · Recepciones',
      'Recepción de lo comprado; devenga (ejercido) contra la partida sin mover inventario'
    )
) AS v (slug, nombre, descripcion)
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- 2. Backfill defensivo de permisos: clonar de `dilesa.construccion.costeo`.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, nuevo.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos src ON src.id = pr.modulo_id AND src.slug = 'dilesa.construccion.costeo'
JOIN core.modulos nuevo ON nuevo.empresa_id = src.empresa_id
  AND nuevo.slug IN (
    'dilesa.compras',
    'dilesa.compras.ordenes',
    'dilesa.compras.requisiciones',
    'dilesa.compras.recepciones'
  )
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
