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
import { Truck, RefreshCw, Search, Phone, Mail, FileText, Save } from 'lucide-react';

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

        <ScrollArea className="flex-1 pr-1 print:h-auto">
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

  // Form State
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newContacto, setNewContacto] = useState('');
  const [newTelefono, setNewTelefono] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRFC, setNewRFC] = useState('');
  const [newDireccion, setNewDireccion] = useState('');
  const [newNotas, setNewNotas] = useState('');

  const handleCreate = async () => {
    if (!newNombre.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    setCreating(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase
        .schema('rdb')
        .from('proveedores')
        .insert({
          nombre: newNombre.trim(),
          contacto: newContacto.trim() || null,
          telefono: newTelefono.trim() || null,
          email: newEmail.trim() || null,
          rfc: newRFC.trim() || null,
          direccion: newDireccion.trim() || null,
          notas: newNotas.trim() || null,
          activo: true,
        });

      if (err) throw err;
      
      setCreateDrawerOpen(false);
      setNewNombre('');
      setNewContacto('');
      setNewTelefono('');
      setNewEmail('');
      setNewRFC('');
      setNewDireccion('');
      setNewNotas('');
      void fetchProveedores();
    } catch (e) {
      console.error(e);
      alert('Error al crear el proveedor');
    } finally {
      setCreating(false);
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Directorio de proveedores ·{' '}
            <span className="text-foreground font-medium">{activos}</span> activos
          </p>
        </div>
        <div>
          <Button onClick={() => setCreateDrawerOpen(true)}>+ Nuevo Proveedor</Button>
        </div>
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

      {/* Create Proveedor Drawer */}
      <Sheet open={createDrawerOpen} onOpenChange={setCreateDrawerOpen}>
        <SheetContent className="sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nuevo Proveedor</SheetTitle>
          </SheetHeader>
          
          <div className="mt-8 space-y-6">
            <div className="space-y-4">
              
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Razón Social / Nombre Comercial <span className="text-destructive">*</span></label>
                <Input 
                  value={newNombre} 
                  onChange={(e) => setNewNombre(e.target.value)} 
                  placeholder="Ej. Comercializadora La Estrella" 
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                 <div className="space-y-2">
                   <label className="text-sm font-medium leading-none">Contacto</label>
                   <Input 
                     value={newContacto} 
                     onChange={(e) => setNewContacto(e.target.value)} 
                     placeholder="Ej. Juan Pérez" 
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium leading-none">Teléfono</label>
                   <Input 
                     value={newTelefono} 
                     onChange={(e) => setNewTelefono(e.target.value)} 
                     placeholder="Ej. 878 123 4567" 
                   />
                 </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                 <div className="space-y-2">
                   <label className="text-sm font-medium leading-none">Email</label>
                   <Input 
                     value={newEmail} 
                     onChange={(e) => setNewEmail(e.target.value)} 
                     placeholder="Ej. ventas@empresa.com" 
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium leading-none">RFC</label>
                   <Input 
                     value={newRFC} 
                     onChange={(e) => setNewRFC(e.target.value)} 
                     placeholder="Ej. XAXX010101000" 
                     className="uppercase"
                   />
                 </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Dirección</label>
                <Input 
                  value={newDireccion} 
                  onChange={(e) => setNewDireccion(e.target.value)} 
                  placeholder="Calle, Número, Colonia, Ciudad..." 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Notas / Detalles adicionales</label>
                <Input 
                  value={newNotas} 
                  onChange={(e) => setNewNotas(e.target.value)} 
                  placeholder="Ej. Días de entrega, condiciones de crédito..." 
                />
              </div>

            </div>

            <div className="flex justify-end pt-6 border-t">
               <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Crear Proveedor
               </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
