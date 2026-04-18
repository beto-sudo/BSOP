'use client';

import { RequireAccess } from '@/components/require-access';
import { TasksModule } from '@/components/tasks/tasks-module';

export default function Page() {
  return (
    <RequireAccess empresa="rdb">
      <TasksModule
        scope="user-empresas"
        empresaSlug=""
        title="Tareas"
      />
    </RequireAccess>
  );
}
