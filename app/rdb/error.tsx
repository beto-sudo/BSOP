'use client';

import { ModuleError } from '@/components/shared/module-error';

export default function RdbError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ModuleError {...props} moduleName="RDB" />;
}
