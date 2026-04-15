import { DilesaSidebar } from '@/components/layout/dilesa-sidebar';
import { DilesaHeader } from '@/components/layout/dilesa-header';

export default function DilesaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <DilesaSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <DilesaHeader />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
