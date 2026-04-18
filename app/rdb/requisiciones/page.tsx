'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  guardarRequisicion,
  actualizarRequisicion,
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
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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

type RequisicionStatus = 'borrador' | 'pendiente' | 'autorizada' | 'convertida_oc' | 'cancelada';

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
  solicitado_por_nombre?: string | null;
  aprobado_por: string | null;
  aprobado_por_nombre?: string | null;
  fecha_solicitud: string | null;
  item_count?: number;
  items?: RequisicionItem[];
  oc_folio?: string | null;
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
    producto: '',
    cantidad: '',
    unidad: '',
    descripcion: '',
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
  return value?.trim() || 'Sistema';
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
    (req) => normalizeStatus(req.estatus) === 'pendiente'
  ).length;
  const autorizadas = requisiciones.filter(
    (req) => normalizeStatus(req.estatus) === 'autorizada'
  ).length;
  const borradores = requisiciones.filter(
    (req) => normalizeStatus(req.estatus) === 'borrador'
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
  onEdit,
}: {
  requisicion: Requisicion | null;
  loadingItems: boolean;
  open: boolean;
  onClose: () => void;
  onAction: () => void;
  onEdit: (requisicion: Requisicion) => void;
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
      <SheetContent className="sm:max-w-[700px] flex min-h-0 flex-col overflow-hidden p-6 print:p-0">
        {/* Membrete y encabezado solo para impresión */}
        <div className="hidden print:block mb-8">
          <img
            src="/membrete-rdb.jpg"
            alt="Membrete Rincón del Bosque"
            className="w-full object-contain mb-6 max-h-32"
          />
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold uppercase tracking-widest">Requisición Interna</h2>
            <p className="text-lg font-semibold mt-1">Folio: {requisicion.folio || 'S/N'}</p>
            {requisicion.oc_folio && (
              <p className="text-sm mt-1 text-gray-600">Orden de Compra: {requisicion.oc_folio}</p>
            )}
          </div>
        </div>

        <SheetHeader className="print:hidden">
          <SheetTitle>{requisicion.folio || 'Sin folio'}</SheetTitle>
          <SheetDescription>{formatDate(requisicion.fecha_solicitud)}</SheetDescription>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 pr-1 print:h-auto print:overflow-visible">
          <div className="mt-6 space-y-6 pb-6 print:space-y-4 print:mt-0 print:pb-0">
            <div className="flex items-center justify-between gap-4 print:hidden">
              <StatusBadge status={status} />
              <span className="text-sm text-muted-foreground">{safeCountLabel(items.length)}</span>
            </div>

            <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2 print:border-none print:bg-transparent print:p-0 print:grid-cols-2 print:text-xs print:mb-4">
              <div>
                <span className="block text-xs uppercase tracking-wider text-muted-foreground print:text-black">
                  Solicitado por
                </span>
                <span className="font-medium text-foreground print:text-black">
                  {requesterName(requisicion.solicitado_por_nombre ?? requisicion.solicitado_por)}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wider text-muted-foreground print:text-black">
                  Fecha
                </span>
                <span className="font-medium text-foreground print:text-black">
                  {formatDate(requisicion.fecha_solicitud)}
                </span>
              </div>
              <div className="print:col-span-2 print:mt-2">
                <span className="block text-xs uppercase tracking-wider text-muted-foreground print:text-black">
                  Aprobado por
                </span>
                <span className="font-medium text-foreground print:text-black">
                  {requisicion.aprobado_por_nombre?.trim() ||
                    requisicion.aprobado_por?.trim() ||
                    'Pendiente'}
                </span>
              </div>
              {requisicion.oc_folio && (
                <div className="print:col-span-2">
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground print:text-black">
                    Orden de Compra generada
                  </span>
                  <span className="font-mono font-semibold text-foreground print:text-black">
                    {requisicion.oc_folio}
                  </span>
                </div>
              )}
            </div>

            <Separator className="print:hidden" />

            <div className="space-y-3 print:space-y-1">
              <div className="print:hidden">
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
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground print:border-none">
                  Esta requisición no tiene artículos cargados todavía.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border print:rounded-none print:border-black">
                  <Table className="print:text-xs">
                    <TableHeader>
                      <TableRow className="print:border-b-black print:bg-gray-100">
                        <TableHead className="print:text-black print:font-bold">Artículo</TableHead>
                        <TableHead className="w-32 text-right print:text-black print:font-bold">
                          Cantidad
                        </TableHead>
                        <TableHead className="w-28 print:text-black print:font-bold">
                          Unidad
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id} className="print:border-b-gray-300">
                          <TableCell className="print:py-1">
                            <div className="font-medium text-foreground print:text-black">
                              {item.descripcion?.trim() || 'Artículo sin descripción'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums print:text-black print:py-1">
                            {item.cantidad ?? '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground print:text-black print:py-1">
                            {item.unidad || 'pza'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Espacio para firmas en impresión */}
            <div className="hidden print:grid grid-cols-2 gap-8 mt-16 pt-8 text-center text-sm">
              <div>
                <div className="w-48 mx-auto border-t border-black pt-2">Firma Solicitante</div>
              </div>
              <div>
                <div className="w-48 mx-auto border-t border-black pt-2">Firma Autorización</div>
              </div>
            </div>

            {actionError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive print:hidden">
                {actionError}
              </div>
            )}

            {(status === 'pendiente' || status === 'autorizada') && (
              <div className="flex flex-wrap justify-end gap-3">
                {status === 'pendiente' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => onEdit(requisicion)}
                      disabled={isPending || loadingItems}
                    >
                      Editar
                    </Button>
                    <Button onClick={handleAprobar} disabled={isPending}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {isPending ? 'Aprobando…' : 'Aprobar'}
                    </Button>
                  </>
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
  userName,
  editingRequisicion,
  onDraftItemChange,
  onAddDraftItem,
  onRemoveDraftItem,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  draftItems: DraftItem[];
  catalogoProductos: {
    id: string;
    nombre: string;
    unidad: string | null;
    categoria: string | null;
  }[];
  userName: string;
  editingRequisicion: Requisicion | null;
  onDraftItemChange: (id: string, field: keyof DraftItem, value: string) => void;
  onAddDraftItem: () => void;
  onRemoveDraftItem: (id: string) => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const isEditing = Boolean(editingRequisicion?.id);
  const printableItems = draftItems.filter((item) =>
    [item.producto, item.descripcion, item.cantidad, item.unidad].some((value) =>
      Boolean(value?.trim())
    )
  );

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
        if (editingRequisicion?.id) {
          await actualizarRequisicion(editingRequisicion.id, items);
        } else {
          await guardarRequisicion(items);
        }
        onSaved();
        onClose();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Error al guardar la requisición');
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="sm:max-w-[700px] flex min-h-0 flex-col overflow-hidden p-6 print:p-0">
        <div className="hidden print:block mb-8">
          <img
            src="/membrete-rdb.jpg"
            alt="Membrete Rincón del Bosque"
            className="w-full object-contain mb-6 max-h-32"
          />
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold uppercase tracking-widest">Requisición Interna</h2>
            <p className="text-lg font-semibold mt-1">
              Folio: {editingRequisicion?.folio || 'REQ-BORRADOR'}
            </p>
          </div>
        </div>

        <SheetHeader className="print:hidden">
          <SheetTitle>
            {isEditing
              ? `Editar ${editingRequisicion?.folio || 'requisición'}`
              : 'Nueva Requisición'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Ajusta productos o cantidades antes de autorizar la requisición.'
              : 'Captura los artículos que necesitas y envía la requisición a autorización.'}
          </SheetDescription>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 pr-1 print:h-auto print:overflow-visible">
          <div className="mt-6 space-y-6 pb-6 print:space-y-4 print:mt-0 print:pb-0">
            <div className="rounded-2xl border bg-gradient-to-br from-muted/40 to-background p-4 print:hidden">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Vista previa
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {editingRequisicion?.folio || 'REQ-BORRADOR'}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isEditing
                      ? 'Ajusta la requisición antes de autorizarla.'
                      : 'Así se ve una requisición nueva antes de guardarse en DB.'}
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
                  <div className="mt-1 font-medium">{userName || 'Sistema'}</div>
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

            <div className="hidden print:block space-y-3">
              <div className="grid gap-4 text-sm grid-cols-2 mb-4">
                <div>
                  <span className="block text-xs uppercase tracking-wider text-black/70">
                    Solicitante
                  </span>
                  <span className="font-medium text-black">{userName || 'Sistema'}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-wider text-black/70">
                    Fecha
                  </span>
                  <span className="font-medium text-black">
                    {formatDate(new Date().toISOString())}
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-black print:rounded-none">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="border-b-black bg-gray-100">
                      <TableHead className="text-black font-bold">Artículo</TableHead>
                      <TableHead className="w-32 text-right text-black font-bold">
                        Cantidad
                      </TableHead>
                      <TableHead className="w-28 text-black font-bold">Unidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(printableItems.length > 0 ? printableItems : draftItems).map((item) => (
                      <TableRow key={`print-${item.id}`} className="border-b-gray-300">
                        <TableCell className="py-1 text-black">
                          {(item.producto || item.descripcion).trim() || 'Artículo pendiente'}
                        </TableCell>
                        <TableCell className="py-1 text-right text-black tabular-nums">
                          {item.cantidad?.trim() || '1'}
                        </TableCell>
                        <TableCell className="py-1 text-black">
                          {item.unidad?.trim() || 'pza'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-16 pt-8 text-center text-sm">
                <div>
                  <div className="w-48 mx-auto border-t border-black pt-2">Firma Solicitante</div>
                </div>
                <div>
                  <div className="w-48 mx-auto border-t border-black pt-2">Firma Autorización</div>
                </div>
              </div>
            </div>

            <div className="space-y-4 print:hidden">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Artículos solicitados</div>
                  <p className="text-sm text-muted-foreground">
                    El flujo de búsqueda/guardado puede conectarse después, pero la experiencia ya
                    queda definida.
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
                            <span className="truncate">
                              {item.producto || 'Buscar o escribir producto...'}
                            </span>
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
                                <CommandEmpty>
                                  No hay resultados. Escribe para usar como texto libre.
                                </CommandEmpty>
                                <CommandGroup>
                                  {catalogoProductos.map((p) => (
                                    <CommandItem
                                      key={p.id}
                                      value={p.nombre}
                                      onSelect={() => {
                                        onDraftItemChange(item.id, 'producto_id', p.id);
                                        onDraftItemChange(item.id, 'producto', p.nombre);
                                        if (p.unidad)
                                          onDraftItemChange(item.id, 'unidad', p.unidad);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 shrink-0 ${item.producto_id === p.id ? 'opacity-100' : 'opacity-0'}`}
                                      />
                                      <span className="truncate">{p.nombre}</span>
                                      {p.categoria && (
                                        <span className="ml-auto text-xs text-muted-foreground shrink-0">
                                          {p.categoria}
                                        </span>
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

            <Separator className="print:hidden" />

            {saveError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive print:hidden">
                {saveError}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3 print:hidden">
              <Button variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={handleGuardar} disabled={isPending}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                {isPending ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Guardar requisición'}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

const TZ = 'America/Matamoros';
const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
function todayRange(): { from: string; to: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const today = formatter.format(now);
  return { from: today, to: today };
}

export default function RequisicionesPage() {
  const [requisiciones, setRequisiciones] = useState<Requisicion[]>([]);
  const [catalogoProductos, setCatalogoProductos] = useState<
    { id: string; nombre: string; unidad: string | null; categoria: string | null }[]
  >([]);
  const [currentUserData, setCurrentUserData] = useState<{ id: string; name: string } | null>(null);
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
      setDateFrom(t);
      setDateTo(t);
    } else if (preset === 'ayer') {
      const ayer = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      ayer.setDate(ayer.getDate() - 1);
      const t = formatter.format(ayer);
      setDateFrom(t);
      setDateTo(t);
    } else if (preset === 'semana') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      setDateFrom(formatter.format(monday));
      setDateTo(formatter.format(today));
    } else if (preset === '7dias') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      d.setDate(d.getDate() - 7);
      setDateFrom(formatter.format(d));
      setDateTo(formatter.format(today));
    } else if (preset === 'mes') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      setDateFrom(formatter.format(first));
      setDateTo(formatter.format(today));
    } else if (preset === '30dias') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      d.setDate(d.getDate() - 30);
      setDateFrom(formatter.format(d));
      setDateTo(formatter.format(today));
    } else if (preset === 'ano') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const first = new Date(d.getFullYear(), 0, 1);
      setDateFrom(formatter.format(first));
      setDateTo(formatter.format(today));
    }
  };
  const [selected, setSelected] = useState<Requisicion | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [editingRequisicion, setEditingRequisicion] = useState<Requisicion | null>(null);
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
        .schema('erp')
        .from('requisiciones')
        .select('id, codigo, justificacion, autorizada_at, solicitante_id, created_at')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('created_at', { ascending: false })
        .limit(200);

      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      const requisicionesData: Requisicion[] = (data ?? []).map((row) => ({
        id: row.id,
        folio: row.codigo ?? null,
        estatus: row.autorizada_at ? 'aprobada' : 'enviada',
        solicitado_por: row.solicitante_id ?? null,
        aprobado_por: null,
        fecha_solicitud: row.created_at ?? null,
      }));

      const { data: prodData } = await supabase
        .schema('erp')
        .from('productos')
        .select('id, nombre, unidad, tipo')
        .eq('activo', true)
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('nombre');

      if (prodData) {
        setCatalogoProductos(prodData.map((p) => ({ ...p, categoria: p.tipo ?? null })));
      }

      const { data: userData } = await supabase.auth.getUser();
      let currentUserId: string | null = null;
      let currentUserName = 'Sistema';

      if (userData?.user?.id) {
        currentUserId = userData.user.id;
        const metadata = userData.user.user_metadata ?? {};
        const metadataName = [metadata.full_name, metadata.name, metadata.first_name]
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
          ?.trim();

        if (metadataName) {
          currentUserName = metadataName;
        } else {
          const { data: userRecord } = await supabase
            .schema('core')
            .from('usuarios')
            .select('first_name, email')
            .eq('id', userData.user.id)
            .maybeSingle();

          currentUserName =
            userRecord?.first_name?.trim() ||
            userData.user.email?.split('@')[0] ||
            userRecord?.email?.split('@')[0] ||
            'Sistema';
        }

        setCurrentUserData({
          id: currentUserId,
          name: currentUserName,
        });
      }

      const userIds = Array.from(
        new Set(
          requisicionesData
            .flatMap((req) => [req.solicitado_por, req.aprobado_por])
            .filter((value): value is string => Boolean(value))
        )
      );

      const userNameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: userRows } = await supabase
          .schema('core')
          .from('usuarios')
          .select('id, first_name, email')
          .in('id', userIds);

        (userRows ?? []).forEach(
          (row: { id: string; first_name: string | null; email: string | null }) => {
            userNameMap.set(row.id, row.first_name?.trim() || row.email?.split('@')[0] || row.id);
          }
        );
      }

      if (currentUserId) {
        userNameMap.set(currentUserId, currentUserName);
      }

      const requisicionIds = requisicionesData.map((req) => req.id);
      const itemCountMap = new Map<string, number>();
      if (requisicionIds.length > 0) {
        const { data: itemRows } = await supabase
          .schema('erp')
          .from('requisiciones_detalle')
          .select('requisicion_id')
          .eq('empresa_id', RDB_EMPRESA_ID)
          .in('requisicion_id', requisicionIds);

        (itemRows ?? []).forEach((row: { requisicion_id: string }) => {
          itemCountMap.set(row.requisicion_id, (itemCountMap.get(row.requisicion_id) ?? 0) + 1);
        });
      }

      setRequisiciones(
        requisicionesData.map((req) => ({
          ...req,
          solicitado_por_nombre: req.solicitado_por
            ? (userNameMap.get(req.solicitado_por) ?? req.solicitado_por)
            : null,
          aprobado_por_nombre: req.aprobado_por
            ? (userNameMap.get(req.aprobado_por) ?? req.aprobado_por)
            : null,
          item_count: itemCountMap.get(req.id) ?? 0,
        }))
      );
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
      const [itemsResult, ocResult] = await Promise.all([
        supabase
          .schema('erp')
          .from('requisiciones_detalle')
          .select('*')
          .eq('empresa_id', RDB_EMPRESA_ID)
          .eq('requisicion_id', requisicion.id)
          .limit(100),
        supabase
          .schema('erp')
          .from('ordenes_compra')
          .select('codigo')
          .eq('empresa_id', RDB_EMPRESA_ID)
          .eq('requisicion_id', requisicion.id)
          .maybeSingle(),
      ]);

      if (itemsResult.error) throw itemsResult.error;

      setSelected((prev) =>
        prev?.id === requisicion.id
          ? {
              ...prev,
              items: (itemsResult.data ?? []) as RequisicionItem[],
              oc_folio: ocResult.data?.codigo ?? null,
            }
          : prev
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
        requesterName(req.solicitado_por_nombre ?? req.solicitado_por)
          .toLowerCase()
          .includes(q) ||
        STATUS_LABELS[normalizedStatus].toLowerCase().includes(q)
      );
    });
  }, [requisiciones, search, statusFilter]);

  const handleDraftItemChange = (id: string, field: keyof DraftItem, value: string) => {
    setDraftItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
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

  const resetDraft = () => {
    setDraftItems(MOCK_DRAFT_ITEMS);
    setEditingRequisicion(null);
  };

  const openEditDraft = (requisicion: Requisicion) => {
    const sourceItems = requisicion.items ?? [];
    setEditingRequisicion(requisicion);
    setDraftItems(
      sourceItems.length > 0
        ? sourceItems.map((item, index) => ({
            id: item.id || `${requisicion.id}-${index}`,
            producto_id: item.producto_id,
            producto: item.descripcion?.trim() || '',
            cantidad: item.cantidad != null ? String(item.cantidad) : '',
            unidad: item.unidad?.trim() || '',
            descripcion: item.descripcion?.trim() || '',
          }))
        : MOCK_DRAFT_ITEMS
    );
    setDetailOpen(false);
    setNewOpen(true);
  };

  const handleRemoveDraftItem = (id: string) => {
    setDraftItems((current) =>
      current.length === 1 ? current : current.filter((item) => item.id !== id)
    );
  };

  const emptyState = (
    <TableRow>
      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
        No se encontraron requisiciones para los filtros seleccionados.
      </TableCell>
    </TableRow>
  );

  const { sortKey, sortDir, onSort, sortData } = useSortableTable<Requisicion>(
    'fecha_solicitud',
    'desc'
  );
  return (
    <RequireAccess empresa="rdb" modulo="rdb.requisiciones">
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
              resetDraft();
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
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPresetKey('custom');
              }}
              className="w-36"
              aria-label="Fecha desde"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPresetKey('custom');
              }}
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
              <SelectItem value="custom" className="hidden">
                Personalizado
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchRequisiciones()}
            aria-label="Actualizar"
          >
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
                <SortableHead
                  sortKey="folio"
                  label="Folio"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="fecha_solicitud"
                  label="Fecha Solicitud"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="solicitado_por_nombre"
                  label="Solicitante"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="estatus"
                  label="Estatus"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="item_count"
                  label="Ítems"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
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
                  : sortData(filtered).map((req) => {
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
                          <TableCell className="text-sm">
                            {requesterName(req.solicitado_por_nombre ?? req.solicitado_por)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={normalizedStatus} />
                          </TableCell>
                          <TableCell className="max-w-64 text-sm text-muted-foreground">
                            {items.length > 0
                              ? summarizeItems(items)
                              : (req.item_count ?? 0) > 0
                                ? safeCountLabel(req.item_count ?? 0)
                                : 'Sin artículos'}
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
          onEdit={openEditDraft}
        />

        <NewRequestSheet
          open={newOpen}
          onClose={() => {
            setNewOpen(false);
            resetDraft();
          }}
          draftItems={draftItems}
          catalogoProductos={catalogoProductos}
          userName={currentUserData?.name || ''}
          editingRequisicion={editingRequisicion}
          onDraftItemChange={handleDraftItemChange}
          onAddDraftItem={handleAddDraftItem}
          onRemoveDraftItem={handleRemoveDraftItem}
          onSaved={() => {
            void fetchRequisiciones();
            resetDraft();
          }}
        />
      </div>
    </RequireAccess>
  );
}
