/**
 * Helper para el sistema de hold + cola de ventas DILESA.
 *
 * Iniciativa `dilesa-prelaunch-audit` Fase 2.
 *
 * Contiene:
 *  - `calcularExpiraAt(createdAt)` — convierte timestamp de creación a
 *    deadline del hold = fin del 2do día hábil MX a las 23:59:59 hora MX.
 *  - `formatearVencimiento(expiraAt)` — string legible en español MX
 *    para banners y emails ("vence el viernes 30 may a las 11:59 pm").
 *  - Reglas / constantes operativas (HOLD_DIAS_HABILES, etc).
 *
 * Decisiones cerradas con Beto:
 *  - 2 días hábiles desde `created_at`.
 *  - Nuevo líder (después de expiración del anterior) recibe 2 días
 *    hábiles frescos contados desde el momento del salto.
 *  - "23:59:59 MX" como final del día — vendedor tiene todo el segundo
 *    día hábil para completar.
 *  - TZ MX = Etc/GMT+6 = UTC-6 fijo (CST sin DST).
 */

import { siguienteDiaHabil } from './calendario-habil';

/** Días hábiles de hold después de crear/promover a líder. */
export const HOLD_DIAS_HABILES = 2;

/**
 * TZ identifier para BSOP: UTC-6 fijo (CST sin DST). NO usamos
 * `America/Matamoros` porque Intl le aplica DST en verano → en mayo
 * Matamoros sería UTC-5, lo que rompe la consistencia operativa con
 * el resto del sistema (ver memoria `reference_playtomic_rdb_timezone.md`).
 */
const TZ_MX_FIJO = 'Etc/GMT+6';

/** Milisegundos restantes antes del cual mandamos email de "expira pronto". */
export const AVISO_HOLD_4H_MS = 4 * 60 * 60 * 1000;

/**
 * Convierte un timestamp de creación (o promoción a líder) en el deadline
 * del hold = fin del 2do día hábil MX a las 23:59:59 hora local.
 *
 * Ejemplos (TZ MX):
 *  - lun 10:00 → mié 23:59:59 (martes y miércoles son hábiles)
 *  - vie 10:00 → mar 23:59:59 (sábado/domingo no cuentan)
 *  - vie 18:00 del 1-may (festivo) → mié 6-may 23:59:59
 *
 * Implementación TZ-segura: el cálculo trabaja con componentes UTC para
 * evitar el bug de "runtime es UTC pero queremos día calendar MX".
 */
export function calcularExpiraAt(createdAt: Date): Date {
  // 1. Obtener el día calendar MX donde se creó (no usar `getDate()` —
  //    en runtime UTC retornaría el día UTC, que puede ser distinto al MX
  //    cuando son horas tardías o tempranas).
  const mxIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_MX_FIJO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(createdAt);
  const [yStr, mStr, dStr] = mxIso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  // 2. Construir un Date que represente "00:00 hora MX" del día de creación.
  //    Lo hacemos como Date local-naive: `new Date(yyyy, mm-1, dd)` queda
  //    en la TZ del runtime, pero como `sumarDiasHabiles` solo lee
  //    `getDay()/getMonth()/getDate()` (no la hora), el offset no
  //    importa para esa función.
  const inicioLocalNaive = new Date(y, m - 1, d);

  // 3. "2 días hábiles enteros" después del día de creación. El día de
  //    creación NO cuenta (operador puede crear solicitud al final del
  //    día). Día 1 = siguiente hábil; Día 2 = siguiente hábil del Día 1.
  let dia2 = inicioLocalNaive;
  for (let i = 0; i < HOLD_DIAS_HABILES; i++) {
    dia2 = siguienteDiaHabil(dia2);
  }

  // 4. Convertir dia2 a "23:59:59.999 hora MX" expresado como timestamp
  //    UTC absoluto. MX (BSOP convention) es UTC-6 fijo, sin DST →
  //    23:59:59 MX = 05:59:59 UTC del día siguiente.
  const y2 = dia2.getFullYear();
  const m2 = dia2.getMonth();
  const d2 = dia2.getDate();
  // 23:59:59 MX (UTC-6) = 05:59:59 UTC del día siguiente. Date.UTC con
  // día+1 a las 05:59:59.999 da el timestamp absoluto correcto.
  return new Date(Date.UTC(y2, m2, d2 + 1, 5, 59, 59, 999));
}

/**
 * Estatus del hold basado en posición en cola y deadline.
 *
 * - `lider_ok`: posición 1, todavía con > AVISO_HOLD_4H_MS restantes
 * - `lider_warning`: posición 1, restan ≤ AVISO_HOLD_4H_MS pero > 0
 * - `lider_expirado`: posición 1 pero expira_at ya pasó (cron lo
 *   marcará en `'expirada'`, pero podemos mostrar como tal en UI antes)
 * - `en_cola`: posición > 1
 * - `expirada`: estado='expirada' en DB
 * - `no_aplica`: venta histórica de Coda, ya asignada, o sin unidad
 */
export type EstadoHold =
  | 'lider_ok'
  | 'lider_warning'
  | 'lider_expirado'
  | 'en_cola'
  | 'expirada'
  | 'no_aplica';

export interface HoldSnapshot {
  estado: EstadoHold;
  /** Posición en la cola (1 = líder, 2+ = en cola). */
  posicion: number | null;
  /** Cuántos en cola detrás del líder (excluyente). */
  esperando: number;
  /** Deadline si aplica. */
  expira_at: Date | null;
  /** Milisegundos restantes — negativo si ya expiró. */
  restante_ms: number | null;
}

export interface ColaItem {
  venta_id: string;
  posicion: number;
  created_at: string;
  expira_at: string | null;
}

/**
 * Calcula el snapshot del estado del hold para una venta, dada la lista
 * actual de la cola para su unidad y el estado de la venta.
 *
 * No hace queries — el caller pasa los datos. Pure function para que sea
 * testeable y consumible desde server (cron) y client (banners).
 */
export function snapshotHold({
  ventaId,
  estado,
  expiraAt,
  cola,
  ahora = new Date(),
}: {
  ventaId: string;
  estado: string;
  expiraAt: Date | null;
  cola: ColaItem[];
  ahora?: Date;
}): HoldSnapshot {
  if (estado === 'expirada') {
    return {
      estado: 'expirada',
      posicion: null,
      esperando: 0,
      expira_at: expiraAt,
      restante_ms: null,
    };
  }
  if (estado !== 'activa') {
    return {
      estado: 'no_aplica',
      posicion: null,
      esperando: 0,
      expira_at: null,
      restante_ms: null,
    };
  }
  const item = cola.find((c) => c.venta_id === ventaId);
  if (!item) {
    // No está en la cola — probablemente venta histórica de Coda o
    // pasó a fase > 1.
    return {
      estado: 'no_aplica',
      posicion: null,
      esperando: 0,
      expira_at: null,
      restante_ms: null,
    };
  }
  const restanteMs = expiraAt ? expiraAt.getTime() - ahora.getTime() : null;
  if (item.posicion === 1) {
    if (restanteMs == null) {
      // Líder sin expira_at definido — caso edge (ej. venta migrada que
      // entró post-cutover sin pasar por el form). Tratamos como ok.
      return {
        estado: 'lider_ok',
        posicion: 1,
        esperando: Math.max(0, cola.length - 1),
        expira_at: null,
        restante_ms: null,
      };
    }
    if (restanteMs <= 0) {
      return {
        estado: 'lider_expirado',
        posicion: 1,
        esperando: Math.max(0, cola.length - 1),
        expira_at: expiraAt,
        restante_ms: restanteMs,
      };
    }
    if (restanteMs <= AVISO_HOLD_4H_MS) {
      return {
        estado: 'lider_warning',
        posicion: 1,
        esperando: Math.max(0, cola.length - 1),
        expira_at: expiraAt,
        restante_ms: restanteMs,
      };
    }
    return {
      estado: 'lider_ok',
      posicion: 1,
      esperando: Math.max(0, cola.length - 1),
      expira_at: expiraAt,
      restante_ms: restanteMs,
    };
  }
  return {
    estado: 'en_cola',
    posicion: item.posicion,
    esperando: item.posicion - 1,
    expira_at: expiraAt,
    restante_ms: restanteMs,
  };
}

/**
 * Formato legible del deadline para banners y emails. En español MX,
 * timezone Etc/GMT+6, formato amigable:
 *  - "vence el viernes 30 may a las 11:59 pm"
 *  - "expira en 3 h 12 min" si restante < 24h
 */
export function formatearVencimiento(
  expiraAt: Date,
  opts: { mostrarRestante?: boolean; ahora?: Date } = {}
): string {
  const { mostrarRestante = false, ahora = new Date() } = opts;
  if (mostrarRestante) {
    const ms = expiraAt.getTime() - ahora.getTime();
    if (ms <= 0) return 'ya expiró';
    const totalMin = Math.floor(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    if (h === 0) return `expira en ${min} min`;
    if (h < 24) return `expira en ${h} h ${min} min`;
    // Si > 24h, fall through al formato de fecha.
  }
  const fechaStr = new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ_MX_FIJO,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(expiraAt);
  const horaStr = new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ_MX_FIJO,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(expiraAt);
  return `${fechaStr} a las ${horaStr}`;
}
