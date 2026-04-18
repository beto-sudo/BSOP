'use client';

/**
 * Standalone "Avances de tarea" sheet — triggered by the MessageSquarePlus
 * button in the rich table's actions cell.
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ErpTask, TaskUpdateRow } from './tasks-shared';
import { UpdateComposer, UpdatesList } from './tasks-updates';

export function TasksUpdatesSheet({
  open,
  onOpenChange,
  task,
  updates,
  loadingUpdates,
  updateContent,
  onUpdateContentChange,
  onSaveUpdate,
  savingUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: ErpTask | null;
  updates: TaskUpdateRow[];
  loadingUpdates: boolean;
  updateContent: string;
  onUpdateContentChange: (v: string) => void;
  onSaveUpdate: () => void;
  savingUpdate: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)] overflow-y-auto"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-[var(--text)] text-lg">Avances de tarea</SheetTitle>
          <SheetDescription className="text-[var(--text)]/50">{task?.titulo ?? ''}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <UpdateComposer
            value={updateContent}
            onChange={onUpdateContentChange}
            onSubmit={onSaveUpdate}
            saving={savingUpdate}
            size="lg"
          />

          <div className="border-t border-[var(--border)] pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-3">
              Historial
            </div>
            <UpdatesList updates={updates} loading={loadingUpdates} variant="sheet" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
