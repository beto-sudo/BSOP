import { RdbSidebar } from '@/components/layout/sidebar';
import { RdbHeader } from '@/components/layout/header';

export default function RdbLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <RdbSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <RdbHeader />
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
