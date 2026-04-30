/**
 * Amber sticky banner shown while an admin is previewing another user.
 *
 * The session is read-only end-to-end — proxy.ts rejects mutations and
 * server actions call `assertNotInPreview()`. The banner copy reflects
 * that contract so the admin knows edits will not go through.
 *
 * Clicking "Salir de vista previa" calls the parent-provided handler to
 * stop, which clears both the in-memory state and the httpOnly cookie.
 */
export function ImpersonationBanner({ label, onStop }: { label: string; onStop: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm print:hidden"
    >
      <span>
        👁️ Viendo como: <strong>{label}</strong> — solo lectura, las acciones de edición están
        deshabilitadas.
      </span>
      <button
        onClick={onStop}
        className="shrink-0 rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
      >
        Salir de vista previa
      </button>
    </div>
  );
}
