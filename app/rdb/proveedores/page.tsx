'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Truck, RefreshCw, Search, Phone, Mail, FileText } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Proveedor = {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  rfc: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string | null;
  updated_at: string | null;
};

// ─── Provider Detail Drawer ───────────────────────────────────────────────────

function ProveedorDetail({
  proveedor,
  open,
  onClose,
}: {
  proveedor: Proveedor | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!proveedor) return null;

  const rows = [
    { label: 'Contacto', value: proveedor.contacto, icon: null },
    { label: 'Teléfono', value: proveedor.telefono, icon: Phone },
    { label: 'Email', value: proveedor.email, icon: Mail },
    { label: 'RFC', value: proveedor.rfc, icon: FileText },
    { label: 'Dirección', value: proveedor.direccion, icon: null },
  ].filter((r) => r.value);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="sm:max-w-[600px]">
        {/* Membrete solo para impresión */}
        <img src="/membrete-rdb.jpg" alt="Membrete Rincón del Bosque" className="hidden print:block w-full object-contain mb-6" />
        <SheetHeader>
          <SheetTitle>{proveedor.nombre}</SheetTitle>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1">
          <div className="mt-6 space-y-6 pb-6">
            <Badge variant={proveedor.activo ? 'default' : 'secondary'}>
              {proveedor.activo ? 'Activo' : 'Inactivo'}
            </Badge>

            <Separator />

            {rows.length > 0 ? (
              <div className="space-y-4">
                {rows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label}>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {Icon && <Icon className="h-3 w-3" />}
                        {row.label}
                      </div>
                      <div className="mt-1 text-sm">{row.value}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin información de contacto</p>
            )}

            {proveedor.notas && (
              <>
                <Separator />
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notas
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{proveedor.notas}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);
  const [selected, setSelected] = useState<Proveedor | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchProveedores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .schema('rdb')
        .from('proveedores')
        .select('*')
        .order('nombre');
      if (err) throw err;
      setProveedores(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProveedores();
  }, [fetchProveedores]);

  const filtered = proveedores.filter((p) => {
    if (!showInactivos && !p.activo) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(q) ||
      (p.contacto ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.rfc ?? '').toLowerCase().includes(q)
    );
  });

  const activos = proveedores.filter((p) => p.activo).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
        <p className="text-sm text-muted-foreground">
          Directorio de proveedores ·{' '}
          <span className="text-foreground font-medium">{activos}</span> activos
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, RFC, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant={showInactivos ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowInactivos((v) => !v)}
        >
          Mostrar inactivos
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => void fetchProveedores()}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading
            ? 'Cargando…'
            : `${filtered.length} proveedor${filtered.length !== 1 ? 'es' : ''}`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>RFC</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  No se encontraron proveedores.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => { setSelected(p); setDrawerOpen(true); }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{p.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.contacto ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {p.telefono ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.rfc ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? 'default' : 'secondary'}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail drawer */}
      <ProveedorDetail
        proveedor={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
