'use client';

import { ComingSoonModule } from '@/components/shared/coming-soon-module';

export default function ProyectosPage() {
  return (
    <ComingSoonModule
      title="Proyectos"
      description="Desarrollos formalizados. Incluirá tabs de Info general, Lotes (dilesa-2), Prototipos asignados (M:N fraccionamiento), Presupuesto y Documentos."
      branchName="feat/dilesa-ui-proyectos"
    />
  );
}
