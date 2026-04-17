'use client';

import { ModuleError } from '@/components/shared/module-error';

export default function HealthError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError {...props} moduleName="Health" />;
}
