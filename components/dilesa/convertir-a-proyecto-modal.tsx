'use client';

/**
 * Modal de confirmación para "Convertir Anteproyecto a Proyecto".
 *
 * Llama `POST /api/dilesa/anteproyectos/[id]/convertir` y redirige al
 * detail del proyecto recién creado. Si la API responde con error, lo
 * muestra inline sin cerrar el modal (para que el usuario pueda
 * corregir y re-intentar sin perder el nombre editado).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight } from 'lucide-react';

export function ConvertirAProyectoModal({
  open,
  onOpenChange,
  anteproyectoId,
  defaultNombre,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anteproyectoId: string;
  defaultNombre: string;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(defaultNombre);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNombre(defaultNombre);
      setError(null);
    }
  }, [open, defaultNombre]);

  const handleConfirm = async () => {
    if (!nombre.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/dilesa/anteproyectos/${anteproyectoId}/convertir`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim() }),
      });
      const payload = (await res.json()) as { proyecto_id?: string; error?: string };
      if (!res.ok || !payload.proyecto_id) {
        setError(payload.error ?? `Error ${res.status} al convertir.`);
        return;
      }
      onOpenChange(false);
      router.push(`/dilesa/proyectos/${payload.proyecto_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convertir a Proyecto</DialogTitle>
          <DialogDescription>
            Esto crea un proyecto formal ligado a este anteproyecto y marca el anteproyecto como
            <strong> convertido</strong>. El anteproyecto queda como referencia histórica.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="conv-nombre" required>
              Nombre del proyecto
            </FieldLabel>
            <Input
              id="conv-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
            />
            <p className="mt-1 text-[11px] text-[var(--text)]/55">
              Por default tomamos el nombre del anteproyecto. Edítalo si quieres un código diferente
              para el proyecto.
            </p>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <input
              type="checkbox"
              checked
              readOnly
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text)]/80">
              Usar el snapshot del anteproyecto como datos iniciales (terreno, área vendible, áreas
              verdes, cantidad de lotes, tipo de proyecto).
              <span className="mt-0.5 block text-[11px] text-[var(--text)]/45">
                Siempre activo en v1; en iteración futura permitiremos override manual.
              </span>
            </span>
          </label>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
            >
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={submitting || !nombre.trim()}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            Convertir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
