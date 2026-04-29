'use client';

/**
 * Standalone "Avances de tarea" sheet — triggered by the MessageSquarePlus
 * button in the rich table's actions cell.
 */

import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
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
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Avances de tarea"
      description={task?.titulo ?? ''}
    >
      <DetailDrawerContent>
        <div className="space-y-4">
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
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
