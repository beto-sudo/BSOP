export const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

export type StockItem = {
  id: string;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  stock_minimo: number | null;
  costo_unitario: number | null;
  ultimo_costo: number | null;
  inventariable: boolean;
  factor_consumo: number;
  total_entradas: number;
  total_vendido: number;
  total_mermas: number;
  stock_actual: number;
  valor_inventario: number | null;
  bajo_minimo: boolean;
  clasificacion?: string;
};

export type MovimientoRow = {
  id: string;
  producto_id: string;
  tipo_movimiento: string;
  cantidad: number;
  costo_unitario: number | null;
  referencia_tipo: string | null;
  notas: string | null;
  created_at: string | null;
  productos: { nombre: string } | null;
};

export type TipoUI = 'ajuste_positivo' | 'ajuste_negativo' | 'merma' | 'consumo_interno';

export const TIPO_OPTIONS: { value: TipoUI; label: string; desc: string }[] = [
  { value: 'ajuste_positivo', label: 'Ajuste Positivo', desc: 'Encontré algo perdido' },
  { value: 'ajuste_negativo', label: 'Ajuste Negativo', desc: 'Me faltan' },
  { value: 'merma', label: 'Merma', desc: 'Se rompió / echó a perder' },
  { value: 'consumo_interno', label: 'Consumo Interno', desc: 'Regalía, cortesía, evento interno' },
];

export const CLASIFICACION_INVENTARIO = ['inventariable', 'merchandising'];
