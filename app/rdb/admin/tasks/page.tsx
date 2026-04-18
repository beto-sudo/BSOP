'use client';

import { RequireAccess } from '@/components/require-access';
import { TasksModule } from '@/components/tasks/tasks-module';

const EMPRESA_ID = '41c0b58f-5483-439b-aaa6-17b9d995697f';

export default function Page() {
  return (
    <RequireAccess empresa="rdb">
      <TasksModule empresaId={EMPRESA_ID} empresaSlug="rdb" title="Tareas — Rincón del Bosque" />
    </RequireAccess>
  );
}
