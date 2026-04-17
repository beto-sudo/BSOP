'use client';

import { ModuleError } from '@/components/shared/module-error';

export default function AdministracionError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError {...props} moduleName="Administración" />;
}
