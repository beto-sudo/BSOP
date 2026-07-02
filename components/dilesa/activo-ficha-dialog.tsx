'use client';

/**
 * ActivoFichaDialog — enviar la ficha comercial (PDF adjunto) a un
 * prospecto de venta/renta (iniciativa `dilesa-portafolio-predios` · S7).
 *
 * El dialog ES la confirmación explícita (regla dura: emails externos
 * nunca automáticos): el operador captura destinatarios, ajusta asunto y
 * mensaje, y confirma. El envío pasa por el catálogo de notificaciones y
 * queda en notification_log. Incluye link para previsualizar el PDF.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { enviarFichaComercial } from '@/app/dilesa/portafolio/actions';
import { ExternalLink, Mail } from 'lucide-react';

export function ActivoFichaDialog({
  activo,
  open,
  onOpenChange,
}: {
  activo: { id: string; nombre: string };
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [para, setPara] = useState('');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string[] | null>(null);

  function handleOpenChange(v: boolean) {
    if (v) {
      setPara('');
      setAsunto(`Ficha comercial — ${activo.nombre}`);
      setMensaje(
        'Buen día,\n\nCon gusto le compartimos la información del inmueble que nos consultó. Quedamos atentos para coordinar una visita o resolver cualquier duda.'
      );
      setError(null);
      setEnviado(null);
    }
    onOpenChange(v);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const r = await enviarFichaComercial({
      activoId: activo.id,
      para: para.split(/[,;\s]+/).filter(Boolean),
      asunto,
      mensaje,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEnviado(r.sentTo);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Enviar ficha comercial
          </DialogTitle>
          <DialogDescription>
            {activo.nombre} — el correo sale a nombre de DILESA con el PDF de la ficha adjunto y
            queda registrado en el log de notificaciones.
          </DialogDescription>
        </DialogHeader>

        {enviado ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text)]">
              ✓ Ficha enviada a <b>{enviado.join(', ')}</b>.
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <FieldLabel>Para (uno o más correos)</FieldLabel>
                <Input
                  value={para}
                  onChange={(e) => setPara(e.target.value)}
                  placeholder="prospecto@correo.com, otro@correo.com"
                />
              </div>
              <div>
                <FieldLabel>Asunto</FieldLabel>
                <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Mensaje</FieldLabel>
                <textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]"
                />
              </div>
              <a
                href={`/api/dilesa/portafolio/activo/${activo.id}/ficha`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Previsualizar el PDF que se adjuntará
              </a>
              {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={() => void handleSubmit()} disabled={saving || !para.trim()}>
                {saving ? 'Enviando…' : 'Confirmar y enviar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
