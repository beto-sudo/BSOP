'use client';

import { RequireAccess } from '@/components/require-access';
import { TasksModule } from '@/components/tasks/tasks-module';

const EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

export default function Page() {
  return (
    <RequireAccess empresa="rdb">
      <TasksModule
        empresaId={EMPRESA_ID}
        empresaSlug="rdb"
        title="Tareas — Rincón del Bosque"
        variant="rich"
      />
    </RequireAccess>
  );
}
