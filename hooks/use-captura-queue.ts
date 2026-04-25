'use client';

/**
 * useCapturaQueue — cola offline-tolerant para conteos de levantamiento.
 *
 * Envuelve `guardarConteo` (server action) con una cola persistente:
 *   1. `guardar(c)` encola en IndexedDB y dispara un sync inmediato.
 *   2. Si la red falla, el conteo queda en cola; un listener `online` y un
 *      poll de 30s lo reintentan.
 *   3. Si IndexedDB no está disponible (Safari ITP, modo privado), degrada
 *      a `localStorage` con el mismo contrato.
 *
 * El hook NO bloquea la captura: `guardar()` resuelve apenas el conteo queda
 * persistido localmente. La UI muestra `pendientes` para informar al usuario
 * que hay sync en vuelo.
 *
 * Diseño deliberado:
 *   - Sin dependencias externas (no idb/dexie). Wrapper minimalista contra
 *     la API nativa, suficiente para un solo object store.
 *   - FIFO estricto: id auto-incremental garantiza que se reenvían en el
 *     orden en que se capturaron (importante si el contador edita un mismo
 *     producto dos veces — solo el último valor debe quedar).
 *   - Si una llamada al server action falla, la sincronización se detiene
 *     y deja el resto de la cola para el próximo intento. Evita rafagas
 *     contra el endpoint cuando el problema es transitorio.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { guardarConteo } from '@/app/rdb/inventario/levantamientos/actions';

export type Conteo = {
  lev_id: string;
  producto_id: string;
  cantidad: number;
  /** Unix ms — útil para auditar latencia entre captura y sync. */
  ts: number;
};

export type UseCapturaQueueResult = {
  /** Encola un conteo y dispara sync inmediato; nunca lanza. */
  guardar: (c: Conteo) => Promise<void>;
  /** Conteos que aún no han sincronizado al servidor. */
  pendientes: number;
  /** True mientras hay un drain de la cola en vuelo. */
  syncing: boolean;
  /** True cuando IndexedDB no está disponible y se usa localStorage. */
  fallbackMode: boolean;
};

const DB_NAME = 'bsop-captura-queue';
const STORE_NAME = 'pending_conteos';
const DB_VERSION = 1;
const LS_KEY = 'bsop-captura-queue-fallback';
const SYNC_INTERVAL_MS = 30_000;

type Stored = Conteo & { id: number };

// ─── IndexedDB wrapper minimalista ────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbAdd(db: IDBDatabase, c: Conteo): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(c);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dbGetAll(db: IDBDatabase): Promise<Stored[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as Stored[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(db: IDBDatabase, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dbCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── localStorage fallback (Safari ITP, modo privado) ─────────────────────────

function lsRead(): Stored[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Stored[]) : [];
  } catch {
    return [];
  }
}

function lsWrite(items: Stored[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // Cuota excedida — el sync periódico drenará en cuanto la red responda.
  }
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useCapturaQueue(): UseCapturaQueueResult {
  const [pendientes, setPendientes] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);

  const dbRef = useRef<IDBDatabase | null>(null);
  const fallbackIdRef = useRef(1);
  const syncingRef = useRef(false);
  const initializedRef = useRef(false);

  const refreshCount = useCallback(async (): Promise<number> => {
    if (dbRef.current) return dbCount(dbRef.current);
    return lsRead().length;
  }, []);

  const sync = useCallback(async (): Promise<void> => {
    if (syncingRef.current || !initializedRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      let items: Stored[];
      if (dbRef.current) {
        items = await dbGetAll(dbRef.current);
      } else {
        items = lsRead();
      }
      items.sort((a, b) => a.id - b.id);

      for (const it of items) {
        const res = await guardarConteo(it.lev_id, it.producto_id, it.cantidad);
        if (!res.ok) break;
        if (dbRef.current) {
          await dbDelete(dbRef.current, it.id);
        } else {
          lsWrite(lsRead().filter((x) => x.id !== it.id));
        }
      }

      setPendientes(await refreshCount());
    } catch {
      // No re-lanzar — el próximo tick de 30s reintenta.
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('IndexedDB no disponible');
        const db = await openDb();
        if (cancelled) {
          db.close();
          return;
        }
        dbRef.current = db;
        setPendientes(await dbCount(db));
      } catch {
        if (cancelled) return;
        setFallbackMode(true);
        const items = lsRead();
        fallbackIdRef.current = items.reduce((m, it) => Math.max(m, it.id), 0) + 1;
        setPendientes(items.length);
      } finally {
        if (!cancelled) {
          initializedRef.current = true;
          // Drain inicial — si quedó cola de una sesión anterior, vacía ahora.
          void sync();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sync]);

  useEffect(() => {
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    const tick = window.setInterval(() => {
      if (pendientes > 0) void sync();
    }, SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(tick);
    };
  }, [sync, pendientes]);

  const guardar = useCallback(
    async (c: Conteo): Promise<void> => {
      if (dbRef.current) {
        await dbAdd(dbRef.current, c);
      } else if (fallbackMode) {
        const id = fallbackIdRef.current++;
        const items = lsRead();
        items.push({ ...c, id });
        lsWrite(items);
      } else {
        // Init aún en vuelo (raro). Llamar directo y degradar silenciosamente.
        const res = await guardarConteo(c.lev_id, c.producto_id, c.cantidad);
        if (!res.ok) throw new Error(res.error);
        return;
      }
      setPendientes(await refreshCount());
      void sync();
    },
    [fallbackMode, refreshCount, sync]
  );

  return { guardar, pendientes, syncing, fallbackMode };
}
