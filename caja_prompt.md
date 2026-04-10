Construye la pantalla de "Cortes de Caja" para RDB (`/app/rdb/cortes/page.tsx`). 

## Reglas de Datos:
1. Revisa `supabase/SCHEMA_REF.md`. Usa las tablas y vistas del esquema real, no inventes nombres de tablas ni columnas.
2. La vista principal de la tabla la vamos a alimentar usando `rdb.v_cortes_totales` o cruzando `rdb.cortes` si es necesario. (Usa los campos exactos documentados en el SCHEMA_REF.md).
3. El estado del corte típicamente es "Abierto" o "Cerrado".

## UI/UX:
1. Estilo idéntico a Ventas (layout shadcn/ui).
2. Tabla central con: Nombre de Caja (caja_nombre), Corte (corte_nombre), Fecha Operativa, Estado (Badge), y Total Esperado o Total Ingresos.
3. Acciones primarias arriba: "Abrir Caja" (botón primario, por ahora que no haga nada más que mostrar un toast o alert).
4. Al hacer clic en una fila, abrir un Side Drawer (Sheet `data-[side=right]:sm:max-w-xl data-[side=right]:md:max-w-2xl` como en Ventas).
5. En el drawer de detalle, mostrar el Resumen Financiero del corte (efectivo inicial, ingresos tarjeta, ingresos efectivo, total, etc.) y dejar un placeholder para una lista de "Movimientos".

Implementa la versión base de lectura primero (Listado + Drawer). Asegúrate de que pase la compilación de TypeScript (`npm run build`) antes de terminar.
