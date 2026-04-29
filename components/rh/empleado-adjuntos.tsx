'use client';

/**
 * EmpleadoAdjuntos — thin wrapper sobre `<FileAttachments>`
 * (file-attachments Sprint 3). Mantiene `EMPLEADO_ROLES` como fuente
 * canónica de roles para empleados; delega upload + preview + delete +
 * path construction al componente compartido.
 */

import { FileAttachments } from '@/components/file-attachments';
import type { FileRole } from '@/components/file-attachments';
import type { EmpresaSlug } from '@/lib/storage';

export const EMPLEADO_ROLES: Array<{ id: string; label: string; icon: string }> = [
  { id: 'foto', label: 'Fotografía', icon: '🖼️' },
  { id: 'ine', label: 'Credencial de Elector (INE)', icon: '🪪' },
  { id: 'curp', label: 'CURP', icon: '🆔' },
  { id: 'acta_nacimiento', label: 'Acta de Nacimiento', icon: '📋' },
  { id: 'comprobante_domicilio', label: 'Comprobante de Domicilio', icon: '🏠' },
  { id: 'csf', label: 'Constancia de Situación Fiscal', icon: '🧾' },
  { id: 'imss', label: 'IMSS', icon: '🏥' },
  { id: 'cv', label: 'Curriculum Vitae', icon: '📄' },
  { id: 'solicitud', label: 'Solicitud de Empleo', icon: '📝' },
  { id: 'constancia_estudios', label: 'Constancia de Estudios', icon: '🎓' },
  { id: 'licencia_conducir', label: 'Licencia de Conducir', icon: '🚗' },
  { id: 'finiquito', label: 'Finiquito', icon: '📑' },
  { id: 'otro', label: 'Otro', icon: '📎' },
];

const FA_ROLES: FileRole[] = EMPLEADO_ROLES.map((r) => ({
  id: r.id,
  label: r.label,
  icon: r.icon,
}));

export function EmpleadoAdjuntos({
  empleadoId,
  empresaId,
  empresaSlug = 'rdb',
  readOnly,
}: {
  empleadoId: string;
  empresaId: string;
  /** Slug de la empresa dueña del empleado. Default `'rdb'`. */
  empresaSlug?: EmpresaSlug;
  readOnly?: boolean;
}) {
  return (
    <FileAttachments
      empresaId={empresaId}
      empresaSlug={empresaSlug}
      entidad="empleados"
      entidadId={empleadoId}
      roles={FA_ROLES}
      defaultUploadRole="cv"
      readOnly={readOnly}
    />
  );
}
