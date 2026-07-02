'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/format';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { PinDialog } from './pin-dialog';
import {
  type CartLine,
  type CuentaAbierta,
  type Estacion,
  type ItemCuenta,
  type PagoInput,
  type ProductoVenta,
  fetchCatalogo,
  fetchCuentasAbiertas,
  fetchEstaciones,
  fetchItemsCuenta,
  rpcAbrirCuenta,
  rpcAgregarRonda,
  rpcCancelarCuenta,
  rpcCobrar,
  rpcEnviarCocina,
  rpcMoverCuenta,
  rpcNotaCuenta,
  rpcVoidItem,
} from './pos-api';

const ESTACION_KEY = 'bsop-pos-estacion';
const CART_KEY = 'bsop-pos-cart';

type PersistedCart = {
  productoId: string;
  cantidad: number;
  descuentoPct: number;
  notas?: string;
}[];

/** Minutos desde un timestamp, para el tablero de cuentas. */
function minutosDesde(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/**
 * Captura del POS (rdb.pos.captura — ADR-056). Táctil, sin modales para
 * agregar: tap en producto suma al carrito. Toda mutación pide PIN y viaja
 * por RPC idempotente; los totales que se muestran son del servidor.
 */
export function PosCapturaModule() {
  const toast = useToast();

  const [estaciones, setEstaciones] = useState<Estacion[] | null>(null);
  const [estacionId, setEstacionId] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<ProductoVenta[]>([]);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<CuentaAbierta[]>([]);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemCuenta[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [ubicacion, setUbicacion] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Acción pendiente que espera PIN. El client_action_id se genera al abrir
  // el diálogo y se reusa en retries — el doble-tap no duplica (ADR-056).
  const [pinAccion, setPinAccion] = useState<null | {
    titulo: string;
    subtitulo?: string;
    run: (pin: string) => Promise<void>;
  }>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [cobroOpen, setCobroOpen] = useState(false);

  const cuenta = useMemo(() => cuentas.find((c) => c.id === cuentaId) ?? null, [cuentas, cuentaId]);

  const refreshCuentas = useCallback(async () => {
    try {
      const cs = await fetchCuentasAbiertas();
      setCuentas(cs);
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al cargar cuentas'));
    }
  }, []);

  const refreshItems = useCallback(async (id: string | null) => {
    if (!id) {
      setItems([]);
      return;
    }
    try {
      setItems(await fetchItemsCuenta(id));
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al cargar la cuenta'));
    }
  }, []);

  useEffect(() => {
    setEstacionId(localStorage.getItem(ESTACION_KEY));
    fetchEstaciones()
      .then(setEstaciones)
      .catch((e) => setError(getSupabaseErrorMessage(e, 'Error al cargar estaciones')));
    fetchCatalogo()
      .then((cat) => {
        setCatalogo(cat);
        // Restaurar el carrito local si el navegador se cerró a media captura.
        try {
          const raw = localStorage.getItem(CART_KEY);
          if (raw) {
            const persisted = JSON.parse(raw) as PersistedCart;
            const byId = new Map(cat.map((p) => [p.id, p]));
            const restored: CartLine[] = persisted
              .filter((l) => byId.has(l.productoId))
              .map((l) => ({
                producto: byId.get(l.productoId)!,
                cantidad: l.cantidad,
                descuentoPct: l.descuentoPct,
                notas: l.notas,
              }));
            if (restored.length > 0) setCart(restored);
          }
        } catch {
          // carrito persistido corrupto: se ignora
        }
      })
      .catch((e) => setError(getSupabaseErrorMessage(e, 'Error al cargar catálogo')));
    void refreshCuentas();
  }, [refreshCuentas]);

  // Persistir el carrito en el dispositivo (sobrevive cierre de navegador).
  useEffect(() => {
    const persisted: PersistedCart = cart.map((l) => ({
      productoId: l.producto.id,
      cantidad: l.cantidad,
      descuentoPct: l.descuentoPct,
      notas: l.notas,
    }));
    if (persisted.length > 0) localStorage.setItem(CART_KEY, JSON.stringify(persisted));
    else localStorage.removeItem(CART_KEY);
  }, [cart]);

  useEffect(() => {
    void refreshItems(cuentaId);
  }, [cuentaId, refreshItems]);

  // Poll ligero: cuentas y cuenta activa cada 15 s (otras estaciones mueven datos).
  useEffect(() => {
    const t = setInterval(() => {
      void refreshCuentas();
      void refreshItems(cuentaId);
    }, 15000);
    return () => clearInterval(t);
  }, [cuentaId, refreshCuentas, refreshItems]);

  const categorias = useMemo(() => {
    const set = new Map<string, number>();
    for (const p of catalogo) set.set(p.categoriaNombre, (set.get(p.categoriaNombre) ?? 0) + 1);
    return [...set.keys()];
  }, [catalogo]);

  const productosVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return catalogo.filter(
      (p) =>
        (!categoria || p.categoriaNombre === categoria) &&
        (!q || p.nombre.toLowerCase().includes(q))
    );
  }, [catalogo, categoria, busqueda]);

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (s, l) => s + l.cantidad * l.producto.precio * (1 - (l.descuentoPct || 0) / 100),
        0
      ),
    [cart]
  );

  function addToCart(p: ProductoVenta) {
    setCart((prev) => {
      // Solo se acumulan líneas "simples": con nota o descuento van aparte.
      const i = prev.findIndex((l) => l.producto.id === p.id && !l.descuentoPct && !l.notas);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], cantidad: next[i].cantidad + 1 };
        return next;
      }
      return [...prev, { producto: p, cantidad: 1, descuentoPct: 0 }];
    });
  }

  function pedirPin(titulo: string, run: (pin: string) => Promise<void>, subtitulo?: string) {
    setPinError(null);
    setPinAccion({ titulo, subtitulo, run });
  }

  async function ejecutarPin(pin: string) {
    if (!pinAccion) return;
    setPinBusy(true);
    setPinError(null);
    try {
      await pinAccion.run(pin);
      setPinAccion(null);
    } catch (e) {
      setPinError(getSupabaseErrorMessage(e, 'Error'));
    } finally {
      setPinBusy(false);
    }
  }

  function confirmarRonda() {
    if (!estacionId || cart.length === 0) return;
    const actionAbrir = crypto.randomUUID();
    const actionRonda = crypto.randomUUID();
    const actionCocina = crypto.randomUUID();
    const lines = cart;
    const hayCocina = lines.some((l) => l.producto.vaACocina);
    pedirPin(
      cuenta ? 'Agregar a la cuenta' : 'Abrir cuenta',
      async (pin) => {
        let id = cuentaId;
        if (!id) {
          id = await rpcAbrirCuenta({
            estacionId,
            pin,
            clientActionId: actionAbrir,
            ubicacion: ubicacion || undefined,
          });
        }
        await rpcAgregarRonda({ cuentaId: id, pin, clientActionId: actionRonda, lines });
        if (hayCocina) {
          await rpcEnviarCocina({ cuentaId: id, pin, clientActionId: actionCocina });
        }
        setCart([]);
        setCuentaId(id);
        await refreshCuentas();
        await refreshItems(id);
        toast.add({ title: hayCocina ? 'Ronda enviada a cocina' : 'Ronda agregada' });
      },
      `${lines.length} producto(s) · ${formatCurrency(cartTotal)}`
    );
  }

  function voidItem(item: ItemCuenta) {
    const postCocina = item.estado !== 'capturado';
    const action = crypto.randomUUID();
    const razon = window.prompt(
      postCocina ? 'Razón de la merma (ya se preparó):' : 'Razón para quitar el item:'
    );
    if (!razon) return;
    const autorizador = postCocina
      ? window.prompt('PIN de autorizador (merma post-cocina):')
      : null;
    if (postCocina && !autorizador) return;
    pedirPin(`Quitar ${item.producto_nombre}`, async (pin) => {
      await rpcVoidItem({
        itemId: item.id,
        pin,
        razon,
        clientActionId: action,
        pinAutorizador: autorizador ?? undefined,
      });
      await refreshItems(cuentaId);
      await refreshCuentas();
    });
  }

  function notaCartLine(idx: number) {
    const actual = cart[idx]?.notas ?? '';
    const nota = window.prompt('Nota para cocina (ej. sin pepinillos, sin mayonesa):', actual);
    if (nota === null) return;
    setCart((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, notas: nota.trim() || undefined } : l))
    );
  }

  function notaCuenta() {
    if (!cuenta) return;
    const action = crypto.randomUUID();
    const nota = window.prompt('Nota general de la orden:', cuenta.notas ?? '');
    if (nota === null) return;
    pedirPin('Nota de la orden', async (pin) => {
      await rpcNotaCuenta({ cuentaId: cuenta.id, pin, nota, clientActionId: action });
      await refreshCuentas();
      toast.add({ title: 'Nota guardada' });
    });
  }

  function moverCuenta() {
    if (!cuenta) return;
    const action = crypto.randomUUID();
    const nueva = window.prompt('¿A dónde se mueve la cuenta?', cuenta.ubicacion ?? '');
    if (!nueva?.trim()) return;
    pedirPin(`Mover cuenta a ${nueva.trim()}`, async (pin) => {
      await rpcMoverCuenta({
        cuentaId: cuenta.id,
        pin,
        ubicacion: nueva.trim(),
        clientActionId: action,
      });
      await refreshCuentas();
      toast.add({ title: `Cuenta movida a ${nueva.trim()}` });
    });
  }

  function cancelarCuenta() {
    if (!cuenta) return;
    const action = crypto.randomUUID();
    const razon = window.prompt('Razón de cancelación de la cuenta:');
    if (!razon) return;
    const hayPreparados = items.some((i) => ['en_cocina', 'listo', 'entregado'].includes(i.estado));
    const autorizador = hayPreparados
      ? window.prompt('PIN de autorizador (hay items preparados):')
      : null;
    if (hayPreparados && !autorizador) return;
    pedirPin('Cancelar cuenta', async (pin) => {
      await rpcCancelarCuenta({
        cuentaId: cuenta.id,
        pin,
        razon,
        clientActionId: action,
        pinAutorizador: autorizador ?? undefined,
      });
      setCuentaId(null);
      await refreshCuentas();
      toast.add({ title: 'Cuenta cancelada' });
    });
  }

  // ── Selección de estación (primera vez por dispositivo) ──────────────────
  if (estaciones && !estacionId) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10">
        <h2 className="text-lg font-medium">¿Qué estación es este dispositivo?</h2>
        {estaciones.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay estaciones configuradas. Un administrador debe crearlas en la tab Admin.
          </p>
        )}
        {estaciones
          .filter((e) => e.tipo !== 'kds')
          .map((e) => (
            <Button
              key={e.id}
              variant="outline"
              className="w-full h-14 text-base justify-between"
              onClick={() => {
                localStorage.setItem(ESTACION_KEY, e.id);
                setEstacionId(e.id);
              }}
            >
              {e.nombre}
              <Badge variant="secondary">{e.tipo}</Badge>
            </Button>
          ))}
      </div>
    );
  }

  const pendientesEntrega = items.filter((i) =>
    ['capturado', 'en_cocina', 'listo'].includes(i.estado)
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {error && (
        <div className="lg:col-span-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Catálogo táctil ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Input
          placeholder="Buscar producto…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="h-11 text-base"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={categoria === null ? 'default' : 'outline'}
            onClick={() => setCategoria(null)}
          >
            Todo
          </Button>
          {categorias.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={categoria === c ? 'default' : 'outline'}
              onClick={() => setCategoria(c)}
            >
              {c}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {productosVisibles.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="min-h-[72px] rounded-lg border bg-card p-3 text-left shadow-sm transition active:scale-[0.98] hover:border-primary/50"
            >
              <div className="line-clamp-2 text-sm font-medium">{p.nombre}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatCurrency(p.precio)}</span>
                {p.vaACocina && <span title="Va a cocina">🍳</span>}
              </div>
            </button>
          ))}
          {catalogo.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">Cargando catálogo…</p>
          )}
        </div>
      </div>

      {/* ── Cuenta + carrito ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Cuenta</h3>
            {cuenta && (
              <Button size="sm" variant="ghost" onClick={() => setCuentaId(null)}>
                Cambiar
              </Button>
            )}
          </div>
          {!cuenta ? (
            <div className="space-y-3">
              {cuentas.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {cuentas.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCuentaId(c.id)}
                      className="rounded-lg border p-3 text-left shadow-sm transition hover:border-primary/60 active:scale-[0.98]"
                    >
                      <div className="truncate text-sm font-medium">
                        {c.ubicacion ?? 'Sin ubicación'}
                      </div>
                      <div className="mt-1 font-mono text-base">{formatCurrency(c.total)}</div>
                      <div className="text-xs text-muted-foreground">
                        {minutosDesde(c.abierta_at)} min abierta
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-1 border-t pt-2">
                <p className="text-xs text-muted-foreground">Nueva cuenta:</p>
                <Input
                  placeholder="Ubicación (Tiendita, Pádel 3…)"
                  value={ubicacion}
                  onChange={(e) => setUbicacion(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {cuentas.length > 1 && (
                <div className="flex flex-wrap gap-1 border-b pb-2">
                  {cuentas
                    .filter((c) => c.id !== cuenta.id)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCuentaId(c.id)}
                        className="rounded-full border px-2 py-0.5 text-xs hover:border-primary/60"
                        title={`${formatCurrency(c.total)} · ${minutosDesde(c.abierta_at)} min`}
                      >
                        {c.ubicacion ?? 's/u'}
                      </button>
                    ))}
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1">
                  {cuenta.ubicacion ?? 'Sin ubicación'}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={moverCuenta}
                    title="Mover de ubicación"
                  >
                    ⇄
                  </Button>
                  <Button size="sm" variant="ghost" onClick={notaCuenta} title="Nota de la orden">
                    📝
                  </Button>
                </span>
                <Badge variant="secondary">{cuenta.estado}</Badge>
              </div>
              {cuenta.notas && (
                <p className="rounded bg-muted px-2 py-1 text-xs italic">“{cuenta.notas}”</p>
              )}
              <ul className="divide-y text-sm">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span
                      className={
                        i.estado.startsWith('void') ? 'line-through text-muted-foreground' : ''
                      }
                    >
                      {i.cantidad}× {i.producto_nombre}
                      {i.descuento_pct > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (−{i.descuento_pct}%)
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline">{i.estado}</Badge>
                      {!i.estado.startsWith('void') && (
                        <Button size="sm" variant="ghost" onClick={() => voidItem(i)}>
                          ✕
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t pt-2 text-base font-medium">
                <span>Total</span>
                <span className="font-mono">{formatCurrency(cuenta.total)}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 h-12"
                  disabled={cuenta.total <= 0 || pendientesEntrega.length > 0}
                  onClick={() => setCobroOpen(true)}
                >
                  Cobrar {formatCurrency(cuenta.total)}
                </Button>
                <Button variant="outline" className="h-12" onClick={cancelarCuenta}>
                  Cancelar
                </Button>
              </div>
              {pendientesEntrega.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {pendientesEntrega.length} item(s) sin entregar — se marcan entregados en el KDS
                  antes de cobrar.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-3 space-y-2">
          <h3 className="text-sm font-medium">Por agregar</h3>
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground">Toca productos para agregarlos.</p>
          ) : (
            <>
              <ul className="divide-y text-sm">
                {cart.map((l, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      {l.producto.nombre}
                      {l.notas && (
                        <span className="block truncate text-xs italic text-muted-foreground">
                          “{l.notas}”
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => notaCartLine(idx)}
                        title="Nota para cocina (sin pepinillos, etc.)"
                      >
                        📝
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setCart((prev) =>
                            prev
                              .map((x, i) => (i === idx ? { ...x, cantidad: x.cantidad - 1 } : x))
                              .filter((x) => x.cantidad > 0)
                          )
                        }
                      >
                        −
                      </Button>
                      <span className="w-6 text-center font-mono">{l.cantidad}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setCart((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, cantidad: x.cantidad + 1 } : x))
                          )
                        }
                      >
                        +
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t pt-2 font-medium">
                <span>Subtotal</span>
                <span className="font-mono">{formatCurrency(cartTotal)}</span>
              </div>
              <Button className="w-full h-12" onClick={confirmarRonda}>
                {cuenta ? 'Agregar a la cuenta' : 'Abrir cuenta y agregar'}
              </Button>
            </>
          )}
        </div>
      </div>

      <PinDialog
        open={pinAccion !== null}
        title={pinAccion?.titulo ?? ''}
        subtitle={pinAccion?.subtitulo}
        onSubmit={ejecutarPin}
        onClose={() => setPinAccion(null)}
        busy={pinBusy}
        error={pinError}
      />

      {cuenta && (
        <CobroDialog
          open={cobroOpen}
          total={cuenta.total}
          onClose={() => setCobroOpen(false)}
          onCobrar={(pagos) => {
            const action = crypto.randomUUID();
            setCobroOpen(false);
            pedirPin(
              'Cobrar cuenta',
              async (pin) => {
                await rpcCobrar({ cuentaId: cuenta.id, pin, clientActionId: action, pagos });
                setCuentaId(null);
                await refreshCuentas();
                toast.add({ title: `Cobrado ${formatCurrency(cuenta.total)}` });
              },
              formatCurrency(cuenta.total)
            );
          }}
        />
      )}
    </div>
  );
}

/** Cobro: efectivo / tarjeta / mixto / cortesía, con propina y cambio. */
function CobroDialog({
  open,
  total,
  onClose,
  onCobrar,
}: {
  open: boolean;
  total: number;
  onClose: () => void;
  onCobrar: (pagos: PagoInput[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cobrar {formatCurrency(total)}</DialogTitle>
        </DialogHeader>
        {/* key={open}: remonta el formulario en cada apertura (reset sin efecto). */}
        <CobroBody key={String(open)} total={total} onClose={onClose} onCobrar={onCobrar} />
      </DialogContent>
    </Dialog>
  );
}

function CobroBody({
  total,
  onClose,
  onCobrar,
}: {
  total: number;
  onClose: () => void;
  onCobrar: (pagos: PagoInput[]) => void;
}) {
  const [efectivo, setEfectivo] = useState('');
  const [tarjeta, setTarjeta] = useState('');
  const [propina, setPropina] = useState('');
  const [recibido, setRecibido] = useState('');
  const [referencia, setReferencia] = useState('');

  const nEfectivo = Number(efectivo) || 0;
  const nTarjeta = Number(tarjeta) || 0;
  const nPropina = Number(propina) || 0;
  const nRecibido = Number(recibido) || 0;
  const aplicado = nEfectivo + nTarjeta;
  const cambio = nRecibido > 0 ? nRecibido - nEfectivo - (nTarjeta > 0 ? 0 : nPropina) : 0;

  function armarPagos(): PagoInput[] {
    const pagos: PagoInput[] = [];
    if (nTarjeta > 0) {
      pagos.push({
        metodo: 'tarjeta',
        monto: nTarjeta,
        propina: nPropina,
        referencia: referencia || undefined,
      });
    }
    if (nEfectivo > 0) {
      pagos.push({
        metodo: 'efectivo',
        monto: nEfectivo,
        recibido: nRecibido > 0 ? nRecibido : undefined,
        propina: nTarjeta > 0 ? 0 : nPropina,
      });
    }
    return pagos;
  }

  return (
    <>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => setEfectivo(String(total))}>
            Todo efectivo
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTarjeta(String(total))}>
            Todo tarjeta
          </Button>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Efectivo</span>
          <Input
            inputMode="decimal"
            value={efectivo}
            onChange={(e) => setEfectivo(e.target.value)}
          />
        </label>
        {nEfectivo > 0 && (
          <label className="block space-y-1 text-sm">
            <span>Recibido (para cambio)</span>
            <Input
              inputMode="decimal"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
            />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span>Tarjeta</span>
          <Input inputMode="decimal" value={tarjeta} onChange={(e) => setTarjeta(e.target.value)} />
        </label>
        {nTarjeta > 0 && (
          <label className="block space-y-1 text-sm">
            <span>Referencia (últimos 4)</span>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span>Propina {nTarjeta > 0 ? '(en tarjeta)' : '(efectivo, opcional)'}</span>
          <Input inputMode="decimal" value={propina} onChange={(e) => setPropina(e.target.value)} />
        </label>
        <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
          <div className="flex justify-between">
            <span>Aplicado</span>
            <span className="font-mono">{formatCurrency(aplicado)}</span>
          </div>
          <div className="flex justify-between">
            <span>Falta</span>
            <span className="font-mono">{formatCurrency(Math.max(0, total - aplicado))}</span>
          </div>
          {nRecibido > 0 && (
            <div className="flex justify-between font-medium">
              <span>Cambio</span>
              <span className="font-mono">{formatCurrency(Math.max(0, cambio))}</span>
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={aplicado < total} onClick={() => onCobrar(armarPagos())}>
          Confirmar cobro
        </Button>
      </DialogFooter>
    </>
  );
}
