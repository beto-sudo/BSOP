Construye la pantalla de "Órdenes de Compra" para RDB (`/app/rdb/ordenes-compra/page.tsx`).

## Reglas de Datos (`supabase/SCHEMA_REF.md`):
- Tabla `rdb.ordenes_compra`: folio, estatus (Ej. "Enviada", "Parcial", "Recibido"), total_estimado, total_real, fecha_emision.
- Tabla `rdb.ordenes_compra_items`: descripcion, cantidad, cantidad_recibida, precio_unitario, subtotal.

## UI/UX (Listado):
1. Pantalla idéntica a Ventas (layout Shadcn UI, search bar).
2. Columnas: Folio, Proveedor, Estatus (Badge), Fecha Emisión, y Total Real (o Estimado).
3. Botón flotante arriba "Nueva Orden de Compra" (abre un dialog o sheet para crear, de momento solo el cascarón visual).

## UI/UX (Side Drawer / Detalle):
1. Al hacer clic, abre un side sheet ancho (`md:max-w-2xl`).
2. Muestra los datos de la OC (Proveedor, fecha).
3. Lista de `ordenes_compra_items` en una tablita interna.
4. **MUY IMPORTANTE:** Si el estatus NO es "Recibido", mostrar un botón primario grande que diga "Recibir OC". (Por ahora no conectes la lógica de inventario, sólo pon el botón visual).

Requisitos: Usar los componentes de Shadcn (Table, Sheet, Badge, Button). Que pase `npm run build` sin errores TS.
