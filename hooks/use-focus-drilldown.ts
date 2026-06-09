'use client';

/**
 * useFocusDrilldown — abre el documento indicado por `?focus=<id>` en cuanto
 * la lista del módulo termina de cargar (iniciativa `dilesa-flujo-gasto`).
 *
 * Encapsula el patrón completo del drill-down del hilo del gasto:
 * - Consume el query param una sola vez al montar (y limpia la URL).
 * - Espera a que `rows` tenga datos; si el id existe, dispara `abrir(row)`.
 * - `abrir` corre en un microtask: el linter de hooks prohíbe setState
 *   síncrono dentro de effects (cascada de renders); aquí la "cascada" es un
 *   deep-link legítimo equivalente a un click del usuario, así que se difiere
 *   fuera del cuerpo del effect (mismo frame, antes del paint).
 *
 * Los callbacks pueden ser arrows inline: el guard de `pendiente` hace
 * inofensivas las re-ejecuciones por identidad.
 */

import { useEffect, useRef } from 'react';
import { consumeFocusParam } from '@/lib/gasto/focus';

export function useFocusDrilldown<T>(
  rows: readonly T[],
  getId: (row: T) => string,
  abrir: (row: T) => void
): void {
  const pendiente = useRef<string | null>(null);

  useEffect(() => {
    pendiente.current = consumeFocusParam();
  }, []);

  useEffect(() => {
    if (!pendiente.current || rows.length === 0) return;
    const id = pendiente.current;
    pendiente.current = null;
    const row = rows.find((r) => getId(r) === id);
    if (row === undefined) return;
    queueMicrotask(() => abrir(row));
  }, [rows, getId, abrir]);
}
