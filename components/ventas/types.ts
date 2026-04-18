export type CorteOption = {
  id: string;
  corte_nombre: string | null;
  caja_nombre: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: string | null;
};

export type Pago = {
  id: number | string;
  metodo?: string | null;
  monto?: number | null;
  payment_method?: string | null;
  amount?: number | null;
};

export type PedidoItem = {
  id: number | string;
  nombre?: string | null;
  name?: string | null;
  product_name?: string | null;
  cantidad?: number | null;
  quantity?: number | null;
  precio?: number | null;
  price?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  subtotal?: number | null;
};

export type Pedido = {
  id: number | string;
  order_id: string | null;
  timestamp: string | null;
  total_amount: number | null;
  status: string | null;
  place_name?: string | null;
  layout_name?: string | null;
  table_name?: string | null;
  external_delivery_id?: string | null;
  total_discount?: number | null;
  service_charge?: number | null;
  tax?: number | null;
  notes?: string | null;
  // lazy-loaded
  pagos?: Pago[];
  items?: PedidoItem[];
};

export type StatusOption = { value: string; label: string };

export const STATUS_OPTIONS: StatusOption[] = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'completed', label: 'Completado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'cancelled', label: 'Cancelado' },
];
