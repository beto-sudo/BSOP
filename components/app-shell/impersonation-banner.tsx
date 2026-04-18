/**
 * Amber sticky banner shown while an admin is previewing another user.
 * Clicking "Salir de vista previa" calls the parent-provided handler to stop.
 */
export function ImpersonationBanner({
  label,
  onStop,
}: {
  label: string;
  onStop: () => void;
}) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm print:hidden">
      <span>
        👁️ Viendo como: <strong>{label}</strong>
      </span>
      <button
        onClick={onStop}
        className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
      >
        Salir de vista previa
      </button>
    </div>
  );
}
