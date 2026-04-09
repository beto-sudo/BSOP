'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  guardarRequisicion,
  aprobarRequisicion,
  generarOrdenCompra,
  type DraftItemInput,
} from './actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Package2,
  RefreshCw,
  Search,
  ShoppingBasket,
  User2,
  XCircle,
  ChevronsUpDown,
  Check,
} from 'lucide-react';

type RequisicionStatus =
  | 'borrador'
  | 'pendiente'
  | 'autorizada'
  | 'convertida_oc'
  | 'cancelada';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

type RequisicionItem = {
  id: string;
  requisicion_id?: string | null;
  producto_id: string | null;
  descripcion: string | null;
  cantidad: number | null;
  unidad: string | null;
};

type Requisicion = {
  id: string;
  folio: string | null;
  estatus: string | null;
  solicitado_por: string | null;
  aprobado_por: string | null;
  fecha_solicitud: string | null;
  items?: RequisicionItem[];
};

type DraftItem = {
  id: string;
  producto_id: string | null;
  producto: string;
  cantidad: string;
  unidad: string;
  descripcion: string;
};


const STATUS_LABELS: Record<RequisicionStatus, string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  autorizada: 'Autorizada',
  convertida_oc: 'Convertida a OC',
  cancelada: 'Cancelada',
};

const STATUS_VARIANTS: Record<RequisicionStatus, BadgeVariant> = {
  borrador: 'outline',
  pendiente: 'secondary',
  autorizada: 'default',
  convertida_oc: 'default',
  cancelada: 'destructive',
};

const STATUS_CLASSNAMES: Record<RequisicionStatus, string> = {
  borrador: 'border-slate-300 text-slate-700',
  pendiente: 'border-amber-200 bg-amber-50 text-amber-700',
  autorizada: 'bg-emerald-600 text-white hover:bg-emerald-600',
  convertida_oc: 'bg-blue-600 text-white hover:bg-blue-600',
  cancelada: 'bg-red-600 text-white hover:bg-red-600',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'autorizada', label: 'Autorizada' },
  { value: 'convertida_oc', label: 'Convertida a OC' },
  { value: 'cancelada', label: 'Cancelada' },
] as const;

const MOCK_DRAFT_ITEMS: DraftItem[] = [
  {
    id: '1',
    producto_id: null,
    producto: 'Hielo en cubo',
    cantidad: '8',
    unidad: 'bolsas',
    descripcion: 'Para barra principal y terraza',
  },
  {
    id: '2',
    producto_id: null,
    producto: 'Refresco mineral',
    cantidad: '3',
    unidad: 'cajas',
    descripcion: 'Reposición de fin de semana',
  },
  {
    id: '3',
    producto_id: null,
    producto: 'Limón',
    cantidad: '15',
    unidad: 'kg',
    descripcion: 'Consumo de barra',
  },
];

function normalizeStatus(status: string | null | undefined): RequisicionStatus {
  const value = String(status ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_');

  switch (value) {
    case 'borrador':
    case 'draft':
      return 'borrador';
    case 'pendiente':
    case 'pending':
    case 'enviada':
      return 'pendiente';
    case 'autorizada':
    case 'aprobada':
    case 'approved':
      return 'autorizada';
    case 'convertida_a_oc':
    case 'convertida_oc':
    case 'convertida':
    case 'oc':
      return 'convertida_oc';
    case 'cancelada':
    case 'rechazada':
    case 'cancelled':
      return 'cancelada';
    default:
      return 'borrador';
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-MX', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  });
}

function safeCountLabel(count: number) {
  return `${count} ítem${count === 1 ? '' : 's'}`;
}

function summarizeItems(items: RequisicionItem[] | undefined) {
  if (!items || items.length === 0) return 'Sin artículos';
  const names = items
    .map((item) => item.descripcion?.trim())
    .filter((value): value is string => Boolean(value));

  if (names.length === 0) return safeCountLabel(items.length);
  const preview = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${preview} +${names.length - 2}` : preview;
}

function requesterName(value: string | null | undefined) {
  return value?.trim() || 'Barra Principal';
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex justify-between gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: RequisicionStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]} className={STATUS_CLASSNAMES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function SummaryBar({ requisiciones }: { requisiciones: Requisicion[] }) {
  const pendientes = requisiciones.filter(
    (req) => normalizeStatus(req.estatus) === 'pendiente',
  ).length;
  const autorizadas = requisiciones.filter(
    (req) => normalizeStatus(req.estatus) === 'autorizada',
  ).length;
  const borradores = requisiciones.filter(
    (req) => normalizeStatus(req.estatus) === 'borrador',
  ).length;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          Total
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{requisiciones.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Package2 className="h-3.5 w-3.5" />
          Pendientes
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">{pendientes}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Autorizadas
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{autorizadas}</div>
        <div className="text-xs text-muted-foreground">{borradores} en borrador</div>
      </div>
    </div>
  );
}

function ExistingRequestSheet({
  requisicion,
  loadingItems,
  open,
  onClose,
  onAction,
}: {
  requisicion: Requisicion | null;
  loadingItems: boolean;
  open: boolean;
  onClose: () => void;
  onAction: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  if (!requisicion) return null;

  const status = normalizeStatus(requisicion.estatus);
  const items = requisicion.items ?? [];

  function handleAprobar() {
    setActionError(null);
    startTransition(async () => {
      try {
        await aprobarRequisicion(requisicion!.id);
        onAction();
        onClose();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Error al aprobar');
      }
    });
  }

  function handleGenerarOC() {
    setActionError(null);
    startTransition(async () => {
      try {
        await generarOrdenCompra(requisicion!.id);
        onAction();
        onClose();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Error al generar OC');
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="sm:max-w-[600px]">
        {/* Membrete solo para impresión */}
        <img src="/membrete-rdb.jpg" alt="Membrete Rincón del Bosque" className="hidden print:block w-full object-contain mb-6" />
        <SheetHeader>
          <SheetTitle>{requisicion.folio || 'Sin folio'}</SheetTitle>
          <SheetDescription>{formatDate(requisicion.fecha_solicitud)}</SheetDescription>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-6 space-y-6 pb-6">
            <div className="flex items-center justify-between gap-4">
              <StatusBadge status={status} />
              <span className="text-sm text-muted-foreground">
                {safeCountLabel(items.length)}
              </span>
            </div>

            <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
              <div>
                <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                  Solicitado por
                </span>
                <span className="font-medium text-foreground">
                  {requesterName(requisicion.solicitado_por)}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                  Aprobado por
                </span>
                <span className="font-medium text-foreground">
                  {requisicion.aprobado_por?.trim() || 'Pendiente'}
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Artículos solicitados
                </div>
                <p className="text-sm text-muted-foreground">
                  Detalle de lo que pidió el área para surtir o convertir a orden de compra.
                </p>
              </div>

              {loadingItems ? (
                <DetailSkeleton />
              ) : items.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  Esta requisición no tiene artículos cargados todavía.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Artículo</TableHead>
                        <TableHead className="w-32 text-right">Cantidad</TableHead>
                        <TableHead className="w-28">Unidad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium text-foreground">
                              {item.descripcion?.trim() || 'Artículo sin descripción'}
                            </div>
                            {item.producto_id ? (
                              <div className="text-xs text-muted-foreground">
                                Producto ID: {item.producto_id}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {item.cantidad ?? '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.unidad || 'pza'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {actionError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {actionError}
              </div>
            )}

            {(status === 'pendiente' || status === 'autorizada') && (
              <div className="flex flex-wrap justify-end gap-3">
                {status === 'pendiente' && (
                  <Button onClick={handleAprobar} disabled={isPending}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {isPending ? 'Aprobando…' : 'Aprobar'}
                  </Button>
                )}
                {status === 'autorizada' && (
                  <Button onClick={handleGenerarOC} disabled={isPending}>
                    <ShoppingBasket className="mr-2 h-4 w-4" />
                    {isPending ? 'Generando OC…' : 'Generar OC'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function NewRequestSheet({
  open,
  onClose,
  draftItems,
  catalogoProductos,
  onDraftItemChange,
  onAddDraftItem,
  onRemoveDraftItem,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  draftItems: DraftItem[];
  catalogoProductos: { id: string; nombre: string; unidad: string | null; categoria: string | null }[];
  onDraftItemChange: (id: string, field: keyof DraftItem, value: string) => void;
  onAddDraftItem: () => void;
  onRemoveDraftItem: (id: string) => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleGuardar = () => {
    setSaveError(null);
    const items: DraftItemInput[] = draftItems
      .filter((item) => (item.producto || item.descripcion).trim())
      .map((item) => ({
        producto_id: item.producto_id,
        descripcion: (item.producto || item.descripcion).trim(),
        cantidad: Math.max(parseFloat(item.cantidad) || 1, 0),
        unidad: item.unidad.trim() || 'pza',
        notas: item.descripcion.trim() || null,
      }));

    if (items.length === 0) {
      setSaveError('Agrega al menos un artículo antes de guardar.');
      return;
    }

    startTransition(async () => {
      try {
        await guardarRequisicion(items);
        onSaved();
        onClose();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Error al guardar la requisición');
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Nueva Requisición</SheetTitle>
          <SheetDescription>
            Captura los artículos que necesitas y envía la requisición a autorización.
          </SheetDescription>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-6 space-y-6 pb-6">
            <div className="rounded-2xl border bg-gradient-to-br from-muted/40 to-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Vista previa
                  </div>
                  <div className="mt-1 text-lg font-semibold">REQ-BORRADOR</div>
                  <p className="text-sm text-muted-foreground">
                    Así se ve una requisición nueva antes de guardarse en DB.
                  </p>
                </div>
                <StatusBadge status="borrador" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background p-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <User2 className="h-3.5 w-3.5" />
                    Solicitante
                  </div>
                  <div className="mt-1 font-medium">Barra Principal</div>
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Fecha solicitud
                  </div>
                  <div className="mt-1 font-medium">{formatDate(new Date().toISOString())}</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Artículos solicitados</div>
                  <p className="text-sm text-muted-foreground">
                    El flujo de búsqueda/guardado puede conectarse después, pero la experiencia ya queda definida.
                  </p>
                </div>
                <Button variant="outline" onClick={onAddDraftItem}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Agregar producto
                </Button>
              </div>

              <div className="space-y-3">
                {draftItems.map((item, index) => (
                  <div key={item.id} className="rounded-xl border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium">Artículo {index + 1}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => onRemoveDraftItem(item.id)}
                        disabled={draftItems.length === 1}
                      >
                        Quitar
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Producto
                        </label>
                        <Popover>
                           <PopoverTrigger
                              render={
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className="w-full justify-between font-normal"
                                />
                              }
                           >
                              <span className="truncate">{item.producto || "Buscar o escribir producto..."}</span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                           </PopoverTrigger>
                           <PopoverContent className="w-[420px] p-0" align="start">
                              <Command>
                                <CommandInput 
                                   placeholder="Buscar producto..." 
                                   onValueChange={(val) => {
                                      // Allow free text if it doesn't match
                                      onDraftItemChange(item.id, 'producto', val);
                                      onDraftItemChange(item.id, 'producto_id', '');
                                   }}
                                />
                                <CommandList className="max-h-64">
                                  <CommandEmpty>No hay resultados. Escribe para usar como texto libre.</CommandEmpty>
                                  <CommandGroup>
                                    {catalogoProductos.map((p) => (
                                      <CommandItem
                                        key={p.id}
                                        value={p.nombre}
                                        onSelect={() => {
                                          onDraftItemChange(item.id, 'producto_id', p.id);
                                          onDraftItemChange(item.id, 'producto', p.nombre);
                                          if (p.unidad) onDraftItemChange(item.id, 'unidad', p.unidad);
                                        }}
                                      >
                                        <Check className={`mr-2 h-4 w-4 shrink-0 ${item.producto_id === p.id ? 'opacity-100' : 'opacity-0'}`} />
                                        <span className="truncate">{p.nombre}</span>
                                        {p.categoria && (
                                          <span className="ml-auto text-xs text-muted-foreground shrink-0">{p.categoria}</span>
                                        )}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                           </PopoverContent>
                        </Popover>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Cantidad
                        </label>
                        <Input
                          value={item.cantidad}
                          onChange={(event) =>
                            onDraftItemChange(item.id, 'cantidad', event.target.value)
                          }
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Unidad
                        </label>
                        <Input
                          value={item.unidad}
                          onChange={(event) =>
                            onDraftItemChange(item.id, 'unidad', event.target.value)
                          }
                          placeholder="pza, caja, kg..."
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Descripción / notas
                        </label>
                        <Input
                          value={item.descripcion}
                          onChange={(event) =>
                            onDraftItemChange(item.id, 'descripcion', event.target.value)
                          }
                          placeholder="Ej. consumo fin de semana"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {saveError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {saveError}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={handleGuardar} disabled={isPending}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                {isPending ? 'Guardando…' : 'Guardar requisición'}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

const TZ = 'America/Matamoros';
function todayRange(): { from: string; to: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const today = formatter.format(now);
  return { from: today, to: today };
}

export default function RequisicionesPage() {
  const [requisiciones, setRequisiciones] = useState<Requisicion[]>([]);
  const [catalogoProductos, setCatalogoProductos] = useState<{ id: string; nombre: string; unidad: string | null; categoria: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => todayRange().from);
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [presetKey, setPresetKey] = useState<string>('hoy');

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    setPresetKey(preset);
    localStorage.setItem('rdb_preset_requisiciones', preset);
    if (!preset) return;
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
    if (preset === 'hoy') {
      const t = formatter.format(today);
      setDateFrom(t); setDateTo(t);
    } else if (preset === 'ayer') {
      const ayer = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      ayer.setDate(ayer.getDate() - 1);
      const t = formatter.format(ayer);
      setDateFrom(t); setDateTo(t);
    } else if (preset === 'semana') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      setDateFrom(formatter.format(monday)); setDateTo(formatter.format(today));
    } else if (preset === '7dias') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      d.setDate(d.getDate() - 7);
      setDateFrom(formatter.format(d)); setDateTo(formatter.format(today));
    } else if (preset === 'mes') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      setDateFrom(formatter.format(first)); setDateTo(formatter.format(today));
    } else if (preset === '30dias') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      d.setDate(d.getDate() - 30);
      setDateFrom(formatter.format(d)); setDateTo(formatter.format(today));
    } else if (preset === 'ano') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const first = new Date(d.getFullYear(), 0, 1);
      setDateFrom(formatter.format(first)); setDateTo(formatter.format(today));
    }
  };
  const [selected, setSelected] = useState<Requisicion | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>(MOCK_DRAFT_ITEMS);

  useEffect(() => {
    const saved = localStorage.getItem('rdb_preset_requisiciones');
    if (saved && saved !== 'hoy') {
      handlePreset(saved);
    }
  }, []);

  const fetchRequisiciones = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .schema('rdb')
        .from('requisiciones')
        .select('*')
        .order('fecha_solicitud', { ascending: false })
        .limit(200);

      if (dateFrom) {
        query = query.gte('fecha_solicitud', `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte('fecha_solicitud', `${dateTo}T23:59:59`);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      setRequisiciones((data ?? []) as Requisicion[]);

      const { data: prodData } = await supabase
        .schema('rdb')
        .from('productos')
        .select('id, nombre, unidad, categoria')
        .eq('activo', true)
        .order('nombre');
      
      if (prodData) {
        setCatalogoProductos(prodData);
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar requisiciones');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchRequisiciones();
  }, [fetchRequisiciones]);

  const openDetail = async (requisicion: Requisicion) => {
    setSelected(requisicion);
    setDetailOpen(true);
    setLoadingItems(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: itemsError } = await supabase
        .schema('rdb')
        .from('requisiciones_items')
        .select('*')
        .eq('requisicion_id', requisicion.id)
        .limit(100);

      if (itemsError) throw itemsError;

      setSelected((prev) =>
        prev?.id === requisicion.id ? { ...prev, items: (data ?? []) as RequisicionItem[] } : prev,
      );
    } catch {
      setSelected((prev) => (prev?.id === requisicion.id ? { ...prev, items: [] } : prev));
    } finally {
      setLoadingItems(false);
    }
  };

  const filtered = useMemo(() => {
    return requisiciones.filter((req) => {
      const normalizedStatus = normalizeStatus(req.estatus);
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (req.folio ?? '').toLowerCase().includes(q) ||
        requesterName(req.solicitado_por).toLowerCase().includes(q) ||
        STATUS_LABELS[normalizedStatus].toLowerCase().includes(q)
      );
    });
  }, [requisiciones, search, statusFilter]);

  const handleDraftItemChange = (id: string, field: keyof DraftItem, value: string) => {
    setDraftItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const handleAddDraftItem = () => {
    setDraftItems((current) => [
      ...current,
      {
        id: String(Date.now()),
        producto_id: null,
        producto: '',
        cantidad: '',
        unidad: '',
        descripcion: '',
      },
    ]);
  };

  const handleRemoveDraftItem = (id: string) => {
    setDraftItems((current) =>
      current.length === 1 ? current : current.filter((item) => item.id !== id),
    );
  };

  const emptyState = (
    <TableRow>
      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
        No se encontraron requisiciones para los filtros seleccionados.
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Requisiciones</h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes de compra internas para abastecer áreas operativas.
          </p>
        </div>
        <Button
          onClick={() => {
            setNewOpen(true);
            setDetailOpen(false);
          }}
        >
          <FilePlus2 className="mr-2 h-4 w-4" />
          Nueva Requisición
        </Button>
      </div>

      {!loading && !error ? <SummaryBar requisiciones={filtered} /> : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar folio, solicitante o estado..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? 'all')}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => { setDateFrom(event.target.value); setPresetKey('custom'); }}
            className="w-36"
            aria-label="Fecha desde"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => { setDateTo(event.target.value); setPresetKey('custom'); }}
            className="w-36"
            aria-label="Fecha hasta"
          />
        </div>
        <Select value={presetKey} onValueChange={handlePreset}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Rango..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoy">Hoy</SelectItem>
            <SelectItem value="ayer">Ayer</SelectItem>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="7dias">Últimos 7 días</SelectItem>
            <SelectItem value="mes">Este mes</SelectItem>
            <SelectItem value="30dias">Últimos 30 días</SelectItem>
            <SelectItem value="ano">Este año</SelectItem>
            <SelectItem value="custom" className="hidden">Personalizado</SelectItem>
          </SelectContent>
        </Select>


        <Button variant="outline" size="icon" onClick={() => void fetchRequisiciones()} aria-label="Actualizar">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading
            ? 'Cargando…'
            : `${filtered.length} requisición${filtered.length === 1 ? '' : 'es'}`}
        </span>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Fecha Solicitud</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead>Ítems</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 5 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered.length === 0
                ? emptyState
                : filtered.map((req) => {
                    const normalizedStatus = normalizeStatus(req.estatus);
                    const items = req.items ?? [];
                    return (
                      <TableRow
                        key={req.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => void openDetail(req)}
                      >
                        <TableCell className="font-mono text-xs font-medium">
                          {req.folio || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(req.fecha_solicitud)}
                        </TableCell>
                        <TableCell className="text-sm">{requesterName(req.solicitado_por)}</TableCell>
                        <TableCell>
                          <StatusBadge status={normalizedStatus} />
                        </TableCell>
                        <TableCell className="max-w-64 text-sm text-muted-foreground">
                          {items.length > 0 ? summarizeItems(items) : safeCountLabel(items.length)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
          </TableBody>
        </Table>
      </div>

      <ExistingRequestSheet
        requisicion={selected}
        loadingItems={loadingItems}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onAction={() => void fetchRequisiciones()}
      />

      <NewRequestSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        draftItems={draftItems}
        catalogoProductos={catalogoProductos}
        onDraftItemChange={handleDraftItemChange}
        onAddDraftItem={handleAddDraftItem}
        onRemoveDraftItem={handleRemoveDraftItem}
        onSaved={() => {
          void fetchRequisiciones();
          setDraftItems(MOCK_DRAFT_ITEMS);
        }}
      />
    </div>
  );
}
