'use client';

import { TasksModule } from '@/components/tasks/tasks-module';

/**
 * /inicio/tasks — "Mis tareas" del usuario logueado.
 *
 * Expansión del widget del dashboard. Filtra a tareas donde
 * `asignado_a` = empleado_id del usuario (en todas sus empresas),
 * con toggle para ocultar/mostrar completadas.
 *
 * Sin RequireAccess de empresa: el dashboard personal es para todo
 * usuario logueado; el proxy ya valida la sesión.
 */
export default function Page() {
  return (
    <TasksModule
      scope="user-empresas"
      empresaSlug=""
      title="Mis tareas"
      subtitle="Tareas donde eres responsable"
      onlyMine
      hideCompletedToggle
    />
  );
}
