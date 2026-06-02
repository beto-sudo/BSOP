/**
 * Tipos + helpers puros del tab "Actas de asamblea".
 *
 * Iniciativa `gobierno-corporativo` · Sprint 3. Cubre `core.gobierno_actas` y
 * sus hijos `gobierno_acta_acuerdos`, `gobierno_acta_votos` (voto por socio) y
 * `gobierno_acta_asistentes`. La lógica testeable (quórum derivado, conteo de
 * votos) vive aquí; el panel la consume.
 */

export type ActaTipo = 'ordinaria' | 'extraordinaria';
export type ActaEstado = 'borrador' | 'firmada' | 'protocolizada';
export type Sentido = 'favor' | 'contra' | 'abstencion';
export type ResultadoAcuerdo = 'aprobado' | 'rechazado' | 'aplazado';

export const ACTA_TIPO_LABELS: Record<ActaTipo, string> = {
  ordinaria: 'Ordinaria',
  extraordinaria: 'Extraordinaria',
};

export const ACTA_ESTADO_LABELS: Record<ActaEstado, string> = {
  borrador: 'Borrador',
  firmada: 'Firmada',
  protocolizada: 'Protocolizada',
};

export const SENTIDO_LABELS: Record<Sentido, string> = {
  favor: 'A favor',
  contra: 'En contra',
  abstencion: 'Abstención',
};

export const SENTIDOS: readonly Sentido[] = ['favor', 'contra', 'abstencion'];

export const RESULTADO_LABELS: Record<ResultadoAcuerdo, string> = {
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  aplazado: 'Aplazado',
};

export const RESULTADOS: readonly ResultadoAcuerdo[] = ['aprobado', 'rechazado', 'aplazado'];

export type Acta = {
  id: string;
  empresa_id: string;
  folio: string | null;
  tipo: ActaTipo;
  fecha: string;
  lugar: string | null;
  asunto: string | null;
  quorum_pct: number | null;
  orden_dia: string[] | null;
  protocolizada: boolean;
  numero_escritura: string | null;
  notario: string | null;
  fecha_protocolizacion: string | null;
  registro_publico: string | null;
  documento_id: string | null;
  estado: ActaEstado;
  notas: string | null;
};

export type Acuerdo = {
  id: string;
  acta_id: string;
  empresa_id: string;
  orden: number;
  punto: string;
  resultado: ResultadoAcuerdo;
  notas: string | null;
};

export type Voto = {
  id: string;
  acuerdo_id: string;
  empresa_id: string;
  socio_id: string | null;
  sentido: Sentido;
  representado_por: string | null;
};

export type Asistente = {
  id: string;
  acta_id: string;
  empresa_id: string;
  socio_id: string | null;
  presente: boolean;
  representado_por: string | null;
  porcentaje: number | null;
};

/**
 * Quórum derivado: suma del % de los asistentes **presentes**. Si el asistente
 * trae `porcentaje` snapshot lo usa; si no, cae al % del socio en el cap table.
 */
export function quorumDerivado(
  asistentes: readonly Asistente[],
  porcentajePorSocio: ReadonlyMap<string, number>
): number {
  return asistentes
    .filter((a) => a.presente)
    .reduce((acc, a) => {
      const pct = a.porcentaje ?? (a.socio_id ? (porcentajePorSocio.get(a.socio_id) ?? 0) : 0);
      return acc + (Number.isFinite(pct) ? pct : 0);
    }, 0);
}

export type VotoTally = { favor: number; contra: number; abstencion: number };

/** Conteo de votos de un acuerdo por sentido. */
export function tallyVotos(votos: readonly Voto[]): VotoTally {
  const t: VotoTally = { favor: 0, contra: 0, abstencion: 0 };
  for (const v of votos) t[v.sentido] += 1;
  return t;
}

/** Resumen legible del tally ("2 a favor · 1 en contra"). */
export function tallyLabel(t: VotoTally): string {
  const parts: string[] = [];
  if (t.favor) parts.push(`${t.favor} a favor`);
  if (t.contra) parts.push(`${t.contra} en contra`);
  if (t.abstencion) parts.push(`${t.abstencion} abst.`);
  return parts.join(' · ') || 'Sin votos';
}

/** Convierte el textarea de orden del día (una línea por punto) a array limpio. */
export function parseOrdenDia(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
