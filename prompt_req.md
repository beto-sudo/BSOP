Construye la pantalla de "Requisiciones" para RDB (`/app/rdb/requisiciones/page.tsx`). 

## Contexto de Negocio
Las requisiciones son solicitudes de compra internas (ej. la barra pide hielos, refrescos).
Tienen estos estatus lógicos: "Borrador" / "Pendiente" / "Autorizada" / "Convertida a OC" / "Cancelada".

## Reglas de Datos (ver `supabase/SCHEMA_REF.md`):
Tabla `rdb.requisiciones`: folio, estatus, solicitado_por, aprobado_por, fecha_solicitud.
Tabla `rdb.requisiciones_items`: producto_id, descripcion, cantidad, unidad.

## UI/UX (Listado):
1. Pantalla idéntica a Ventas (layout Shadcn UI, barra superior con filtros).
2. Tabla central con: Folio, Fecha Solicitud, Solicitante (puede ser texto quemado por ahora si no hay join de usuarios), Estatus (con Badge de colores), e Ítems (un string concatenado o count).

## UI/UX (Side Drawer / Creación):
1. Al hacer clic en un renglón, abre el Sheet lateral derecho (como en Ventas, `md:max-w-2xl`).
2. Muestra los detalles de la requisición (quién pide, fecha, y la tablita de artículos solicitados).
3. Botón arriba: "Nueva Requisición". Al picarle, debe abrir un formulario para **agregar productos** a una nueva lista. Por ahora la interacción de buscar producto y guardarlo a DB puede estar mockeada o en esqueleto visual, me interesa que el cascarón de "cómo se ve una requisición nueva vs una ya hecha" quede perfecto.

Asegúrate de compilar TypeScript exitosamente (`npm run build`).
