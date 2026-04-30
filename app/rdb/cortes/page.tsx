import { CortesView } from '@/components/cortes/cortes-view';
import { DesktopOnlyNotice } from '@/components/responsive';

/**
 * @module Cortes (RDB)
 * @responsive desktop-only
 */
export default function CortesPage() {
  return (
    <>
      <DesktopOnlyNotice module="Cortes" />
      <div className="hidden sm:block">
        <CortesView />
      </div>
    </>
  );
}
