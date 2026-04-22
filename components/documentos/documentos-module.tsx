'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Carried from the original pages: dynamic document metadata crosses
 * Supabase JSON boundaries; tightening needs a schema-wide refactor, out
 * of scope for this consolidation PR.
 */

/**
 * DocumentosModule — reusable legal-docs module.
 *
 * Consolidates the previously duplicated pages under
 *  - app/administracion/documentos   (cross-empresa admin)
 *  - app/dilesa/admin/documentos     (DILESA only)
 *  - app/rdb/admin/documentos        (RDB only)
 * into a single parametrized component.
 *
 * Usage:
 *
 *   // Per-empresa (dilesa/rdb style)
 *   <DocumentosModule
 *     empresaId="<uuid>"
 *     empresaSlug="dilesa"
 *     title="Documentos — DILESA"
 *   />
 *
 *   // Cross-empresa (administracion): fetches all empresas the user belongs to
 *   <DocumentosModule scope="user-empresas" empresaSlug="" title="Documentos" />
 *
 * Signed-URL flow preserved exactly: the adjuntos bucket is private, rows
 * store only object paths, and fetchAdjuntosBulk enriches them with
 * short-lived signed URLs via lib/adjuntos.ts. Table and detail sheet
 * render those URLs directly.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Loader2, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { getAdjuntoPath, getAdjuntoSignedUrls } from '@/lib/adjuntos';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FilterCombobox } from '@/components/ui/filter-combobox';
// Combobox queda disponible si se necesita en form fields (ver documento-form-fields.tsx).
import { useSortableTable } from '@/hooks/use-sortable-table';

import type { Adjunto, Documento, NotariaOption } from './types';
import { getVencStatus } from './helpers';
import { FLabel } from './ui';
import { DocumentosTable } from './documentos-table';
import { DocumentoCreateSheet } from './documento-create-sheet';
import { DocumentoDetailSheet } from './documento-detail-sheet';
import { DocumentoSemanticSearch } from './documento-semantic-search';

export type DocumentosModuleProps = {
  /**
   * Single-empresa mode: filter all queries by this empresa_id.
   * Mutually exclusive with `scope="user-empresas"`.
   */
  empresaId?: string;

  /**
   * Scope mode:
   * - omitted or 'empresa' → use `empresaId` (single)
   * - 'user-empresas' → fetch the current user's empresa ids from
   *   core.usuarios_empresas and show all of them (global admin).
   */
  scope?: 'empresa' | 'user-empresas';

  /** URL slug — reserved for future detail-page linking. */
  empresaSlug: string;

  /** Page heading (e.g. "Documentos — DILESA"). */
  title: string;

  /** Optional subtitle. Defaults to "Escrituras, contratos, seguros y documentos legales". */
  subtitle?: string;
};

export function DocumentosModule({
  empresaId,
  scope = 'empresa',
  empresaSlug,
  title,
  subtitle = 'Escrituras, contratos, seguros y documentos legales',
}: DocumentosModuleProps) {
  const supabase = createSupabaseERPClient();

  const [empresaIds, setEmpresaIds] = useState<string[]>(
    scope === 'empresa' && empresaId ? [empresaId] : []
  );
  const [primaryEmpresaId, setPrimaryEmpresaId] = useState(
    scope === 'empresa' && empresaId ? empresaId : ''
  );
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterTipoOperacion, setFilterTipoOperacion] = useState('all');
  const [filterMunicipio, setFilterMunicipio] = useState('all');
  const [showSemanticSearch, setShowSemanticSearch] = useState(false);
  const [semanticResultIds, setSemanticResultIds] = useState<string[] | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showCreateNotaria, setShowCreateNotaria] = useState(false);
  const [creatingNotaria, setCreatingNotaria] = useState(false);
  const [newNotariaNombre, setNewNotariaNombre] = useState('');
  const [notarias, setNotarias] = useState<NotariaOption[]>([]);

  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);
  const [adjuntosPorDoc, setAdjuntosPorDoc] = useState<Record<string, Adjunto[]>>({});

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchEmpresaIds = useCallback(async (): Promise<string[]> => {
    if (scope === 'empresa') return empresaId ? [empresaId] : [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: cu } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user.email ?? '').toLowerCase())
      .maybeSingle();
    if (!cu) return [];
    const { data: ueData } = await supabase
      .schema('core')
      .from('usuarios_empresas')
      .select('empresa_id')
      .eq('usuario_id', cu.id)
      .eq('activo', true);
    const ids = (ueData ?? []).map((r: any) => r.empresa_id as string);
    setEmpresaIds(ids);
    if (ids.length > 0) setPrimaryEmpresaId(ids[0]);
    return ids;
  }, [scope, empresaId, supabase]);

  const fetchDocumentos = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setDocumentos([]);
        return;
      }
      const { data, error: err } = await supabase
        .schema('erp')
        .from('documentos')
        .select('*')
        .in('empresa_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (err) {
        setError(err.message);
        return;
      }
      setDocumentos((data ?? []) as Documento[]);
    },
    [supabase]
  );

  const fetchNotarias = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setNotarias([]);
        return;
      }
      const { data: provData } = await supabase
        .schema('erp')
        .from('proveedores')
        .select('id, persona_id, empresa_id')
        .in('empresa_id', ids)
        .eq('categoria', 'notaria')
        .eq('activo', true)
        .is('deleted_at', null);
      const pIds = [...new Set((provData ?? []).map((p: any) => p.persona_id).filter(Boolean))];
      if (pIds.length === 0) {
        setNotarias([]);
        return;
      }
      const { data: persData } = await supabase
        .schema('erp')
        .from('personas')
        .select('id, nombre')
        .in('id', pIds)
        .is('deleted_at', null);
      const pm = new Map((persData ?? []).map((p: any) => [p.id, p.nombre as string]));
      setNotarias(
        (provData ?? [])
          .map((p: any) => ({
            id: p.id,
            empresa_id: p.empresa_id,
            nombre: pm.get(p.persona_id) ?? 'Sin nombre',
          }))
          .sort((a: NotariaOption, b: NotariaOption) => a.nombre.localeCompare(b.nombre, 'es-MX'))
      );
    },
    [supabase]
  );

  const fetchAdjuntosBulk = useCallback(
    async (docIds: string[]) => {
      if (docIds.length === 0) {
        setAdjuntosPorDoc({});
        return;
      }
      const { data } = await supabase
        .schema('erp')
        .from('adjuntos')
        .select('id, nombre, url, tipo_mime, tamano_bytes, created_at, entidad_id, rol')
        .eq('entidad_tipo', 'documento')
        .in('entidad_id', docIds)
        .order('created_at', { ascending: false });

      // Bucket is private — enrich each row with a short-lived signed URL so
      // the existing `a.url` read sites don't need to change. Legacy rows with
      // full public URLs are normalized to their path by getAdjuntoSignedUrls.
      const signedMap = await getAdjuntoSignedUrls(
        supabase,
        (data ?? []).map((a: { url: string }) => a.url)
      );

      const map: Record<string, Adjunto[]> = {};
      for (const a of data ?? []) {
        const key = a.entidad_id as string;
        if (!map[key]) map[key] = [];
        const path = getAdjuntoPath(a.url);
        const signedUrl = path ? signedMap.get(path) : null;
        map[key].push({
          id: a.id,
          nombre: a.nombre,
          url: signedUrl ?? a.url,
          tipo_mime: a.tipo_mime,
          tamano_bytes: a.tamano_bytes,
          rol: a.rol ?? 'anexo',
          created_at: a.created_at,
        });
      }
      setAdjuntosPorDoc(map);
    },
    [supabase]
  );

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      const ids = await fetchEmpresaIds();
      if (cancelled) return;
      await Promise.all([fetchDocumentos(ids), fetchNotarias(ids)]);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchEmpresaIds, fetchDocumentos, fetchNotarias]);

  useEffect(() => {
    if (documentos.length === 0) return;
    void fetchAdjuntosBulk(documentos.map((d) => d.id));
  }, [documentos, fetchAdjuntosBulk]);

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchDocumentos(empresaIds), fetchNotarias(empresaIds)]);
    setLoading(false);
  };

  const handleRefreshAdjuntos = () => {
    const ids = documentos.map((d) => d.id);
    if (selectedDoc && !ids.includes(selectedDoc.id)) ids.push(selectedDoc.id);
    void fetchAdjuntosBulk(ids);
  };

  const handleDocUpdated = (updated: Documento) => {
    setSelectedDoc(updated);
    setDocumentos((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handleDocDeleted = (id: string) => {
    // El detail sheet ya cerró el panel — aquí solo removemos del listado y
    // limpiamos cualquier referencia stale (selectedDoc, semanticResultIds).
    setDocumentos((prev) => prev.filter((d) => d.id !== id));
    setSelectedDoc((prev) => (prev?.id === id ? null : prev));
    setSemanticResultIds((prev) => (prev ? prev.filter((rid) => rid !== id) : prev));
  };

  const handleDocCreated = (newDoc: Documento) => {
    setDocumentos((prev) => [newDoc, ...prev]);
    setSelectedDoc(newDoc);
  };

  const handleCreateNotaria = async () => {
    if (!newNotariaNombre.trim() || !primaryEmpresaId) return;
    setCreatingNotaria(true);
    try {
      const { data: persona, error: pe } = await supabase
        .schema('erp')
        .from('personas')
        .insert({
          empresa_id: primaryEmpresaId,
          nombre: newNotariaNombre.trim(),
          tipo: 'proveedor',
        })
        .select('id')
        .single();
      if (pe) throw pe;
      const { data: prov, error: pre } = await supabase
        .schema('erp')
        .from('proveedores')
        .insert({
          empresa_id: primaryEmpresaId,
          persona_id: persona.id,
          categoria: 'notaria',
          activo: true,
        })
        .select('id, empresa_id')
        .single();
      if (pre) throw pre;
      const nn = { id: prov.id, empresa_id: prov.empresa_id, nombre: newNotariaNombre.trim() };
      setNotarias((prev) =>
        [...prev, nn].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'))
      );
      setNewNotariaNombre('');
      setShowCreateNotaria(false);
    } catch (e: any) {
      alert(`Error: ${e?.message ?? 'desconocido'}`);
    } finally {
      setCreatingNotaria(false);
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const tiposPresentes = [...new Set(documentos.map((d) => d.tipo).filter(Boolean))] as string[];

  const tiposOperacionPresentes = useMemo(
    () => [...new Set(documentos.map((d) => d.tipo_operacion).filter(Boolean))] as string[],
    [documentos]
  );

  const municipiosPresentes = useMemo(
    () => [...new Set(documentos.map((d) => d.municipio).filter(Boolean))] as string[],
    [documentos]
  );

  // Orden determinado por búsqueda semántica si hay resultados; si no, el que
  // venga de la tabla. `semanticResultIds` es un array ranqueado.
  const semanticRankMap = useMemo(() => {
    if (!semanticResultIds) return null;
    const map = new Map<string, number>();
    semanticResultIds.forEach((id, i) => map.set(id, i));
    return map;
  }, [semanticResultIds]);

  const filtered = documentos.filter((d) => {
    // Si hay resultados de búsqueda semántica, solo mostramos esos.
    if (semanticRankMap && !semanticRankMap.has(d.id)) return false;

    if (search) {
      const q = search.toLowerCase();
      const inTitulo = d.titulo.toLowerCase().includes(q);
      const inNumero = (d.numero_documento ?? '').toLowerCase().includes(q);
      const inDescripcion = (d.descripcion ?? '').toLowerCase().includes(q);
      const inContenido = (d.contenido_texto ?? '').toLowerCase().includes(q);
      const inUbicacion = (d.ubicacion_predio ?? '').toLowerCase().includes(q);
      const inPartes = (d.partes ?? []).some(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          (p.rfc ?? '').toLowerCase().includes(q) ||
          (p.representante ?? '').toLowerCase().includes(q)
      );
      if (!inTitulo && !inNumero && !inDescripcion && !inContenido && !inUbicacion && !inPartes)
        return false;
    }
    if (filterTipo !== 'all' && d.tipo !== filterTipo) return false;
    if (filterTipoOperacion !== 'all' && d.tipo_operacion !== filterTipoOperacion) return false;
    if (filterMunicipio !== 'all' && d.municipio !== filterMunicipio) return false;
    return true;
  });

  const expiredCount = documentos.filter(
    (d) => getVencStatus(d.fecha_vencimiento) === 'expired'
  ).length;
  const soonCount = documentos.filter((d) => getVencStatus(d.fecha_vencimiento) === 'soon').length;

  const baseSortCtx = useSortableTable('fecha_emision', 'desc');

  // Si hay búsqueda semántica activa, override sortData para respetar el rank
  // devuelto por la API (el doc más similar primero). Los filtros, sorts por
  // columna y reset siguen disponibles — el usuario puede ordenar por fecha
  // si prefiere, pero el default mientras dure la búsqueda es el rank IA.
  const sortCtx = useMemo(() => {
    if (!semanticRankMap) return baseSortCtx;
    return {
      ...baseSortCtx,
      sortData: <T extends Record<string, unknown>>(rows: T[]): T[] => {
        if (baseSortCtx.sortKey !== 'fecha_emision' || baseSortCtx.sortDir !== 'desc') {
          return baseSortCtx.sortData(rows);
        }
        return [...rows].sort((a, b) => {
          const ra = semanticRankMap.get(a.id as string) ?? Number.MAX_SAFE_INTEGER;
          const rb = semanticRankMap.get(b.id as string) ?? Number.MAX_SAFE_INTEGER;
          return ra - rb;
        });
      },
    };
  }, [baseSortCtx, semanticRankMap]);

  // Scope the detail sheet's update query by empresa_id for single-empresa
  // mounts (defense-in-depth). The cross-empresa admin view relies on RLS.
  const scopedEmpresaId = scope === 'empresa' ? empresaId : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nuevo Documento
          </Button>
        </div>
      </div>

      {/* Alert banners */}
      {(expiredCount > 0 || soonCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {expiredCount} {expiredCount === 1 ? 'documento vencido' : 'documentos vencidos'}
            </div>
          )}
          {soonCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
              <Clock className="h-4 w-4 shrink-0" />
              {soonCount} por vencer (≤60 días)
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <Input
              placeholder="Buscar en título, número, contenido, ubicación o partes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <FilterCombobox
            value={filterTipo}
            onChange={setFilterTipo}
            options={tiposPresentes.map((t) => ({ id: t, label: t }))}
            placeholder="Tipo"
            searchPlaceholder="Buscar tipo..."
            clearLabel="Todos los tipos"
            className="w-40"
          />
          {tiposOperacionPresentes.length > 0 && (
            <FilterCombobox
              value={filterTipoOperacion}
              onChange={setFilterTipoOperacion}
              options={tiposOperacionPresentes.map((t) => ({ id: t, label: t }))}
              placeholder="Operación"
              searchPlaceholder="Buscar operación..."
              clearLabel="Todas las operaciones"
              className="w-52"
            />
          )}
          {municipiosPresentes.length > 0 && (
            <FilterCombobox
              value={filterMunicipio}
              onChange={setFilterMunicipio}
              options={municipiosPresentes.map((m) => ({ id: m, label: m }))}
              placeholder="Municipio"
              searchPlaceholder="Buscar municipio..."
              clearLabel="Todos los municipios"
              className="w-44"
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSemanticSearch(true)}
            className="gap-1.5 rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
          >
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
            Búsqueda IA
          </Button>
          {semanticRankMap && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSemanticResultIds(null)}
              className="rounded-xl border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10"
            >
              Limpiar búsqueda IA ({semanticRankMap.size})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <DocumentosTable
        loading={loading}
        error={error}
        filtered={filtered}
        documentos={documentos}
        adjuntosPorDoc={adjuntosPorDoc}
        onSelect={setSelectedDoc}
        onCreate={() => setShowCreate(true)}
        sort={sortCtx}
      />

      {!loading && documentos.length > 0 && (
        <p className="text-right text-xs text-[var(--text-subtle)]">
          {filtered.length} de {documentos.length} documentos
        </p>
      )}

      {/* Sheets */}
      <DocumentoCreateSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        notarias={notarias}
        onOpenCreateNotaria={() => setShowCreateNotaria(true)}
        primaryEmpresaId={primaryEmpresaId}
        empresaSlugForTitulo={empresaSlug || undefined}
        onCreated={handleDocCreated}
      />

      <DocumentoDetailSheet
        doc={selectedDoc}
        open={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
        notarias={notarias}
        onOpenCreateNotaria={() => setShowCreateNotaria(true)}
        adjuntos={selectedDoc ? (adjuntosPorDoc[selectedDoc.id] ?? []) : []}
        onRefreshAdjuntos={handleRefreshAdjuntos}
        onDocUpdated={handleDocUpdated}
        onDocDeleted={handleDocDeleted}
        scopedEmpresaId={scopedEmpresaId}
      />

      <DocumentoSemanticSearch
        open={showSemanticSearch}
        onClose={() => setShowSemanticSearch(false)}
        empresaIds={empresaIds}
        onResults={(ids) => {
          setSemanticResultIds(ids);
          setShowSemanticSearch(false);
        }}
      />

      {/* Create Notaría Dialog (small, on top of sheet) */}
      <Dialog open={showCreateNotaria} onOpenChange={setShowCreateNotaria}>
        <DialogContent className="max-w-md rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Nueva notaría</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FLabel>Nombre de la notaría</FLabel>
              <Input
                placeholder="Ej: Notaría Pública No. 45 — Lic. González"
                value={newNotariaNombre}
                onChange={(e) => setNewNotariaNombre(e.target.value)}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateNotaria(false);
                setNewNotariaNombre('');
              }}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateNotaria}
              disabled={creatingNotaria || !newNotariaNombre.trim()}
              className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
            >
              {creatingNotaria ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
