'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  importPaymentsCsv,
  type ImportPaymentsResult,
} from '@/app/rdb/playtomic/import-csv/actions';

const DATE_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE_FMT.format(d);
}

export function ImportCsvView() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportPaymentsResult | null>(null);

  function onPickFile(f: File | null) {
    if (f && !f.name.toLowerCase().endsWith('.csv')) {
      setResult({ ok: false, error: 'El archivo debe ser .csv' });
      setFile(null);
      return;
    }
    setFile(f);
    setResult(null);
  }

  function onSubmit() {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    startTransition(async () => {
      const res = await importPaymentsCsv(formData);
      setResult(res);
      if (res.ok) setFile(null);
    });
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold text-[var(--text)]">
          Import de pagos Playtomic (CSV)
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Sube el reporte de pagos exportado desde Playtomic Manager (rango libre, ej. semanal).
          UPSERT por payment_id — re-subir el mismo periodo es seguro y solo actualiza filas con
          cambios.
        </p>
      </header>

      <div
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-colors ${
          isDragging
            ? 'border-emerald-500/60 bg-emerald-500/10'
            : 'border-[var(--border)] bg-[var(--card)]'
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onPickFile(f);
        }}
      >
        {file ? (
          <div className="space-y-2 text-center">
            <p className="font-medium text-[var(--text)]">{file.name}</p>
            <p className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <p className="text-center text-sm text-[var(--text-muted)]">
            Arrastra el CSV aquí, o pulsa el botón para seleccionarlo.
          </p>
        )}
        <label className="cursor-pointer">
          <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--panel)]/40 px-3 py-1.5 text-sm hover:bg-[var(--panel)]/60">
            Seleccionar archivo
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          Tamaño máximo: 10 MB. Formato esperado: export Playtomic Manager con delimitador
          &quot;;&quot; y decimales con coma.
        </p>
        <Button onClick={onSubmit} disabled={!file || isPending}>
          {isPending ? 'Subiendo…' : 'Importar'}
        </Button>
      </div>

      {result ? <ResultPanel result={result} /> : null}
    </div>
  );
}

function ResultPanel({ result }: { result: ImportPaymentsResult }) {
  if (!result.ok) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-[var(--text)]">
        <strong>Error:</strong> {result.error}
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
      <h2 className="text-base font-semibold text-[var(--text)]">Resumen del upload</h2>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-[var(--text-muted)]">Filas en CSV</dt>
          <dd className="font-medium">{result.total_in_csv}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Insertadas</dt>
          <dd className="font-medium text-emerald-300">{result.rows_inserted}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Actualizadas</dt>
          <dd className="font-medium text-amber-300">{result.rows_updated}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Errores de parse</dt>
          <dd className="font-medium">
            {result.parse_errors.length > 0 ? result.parse_errors.length : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Rango service date</dt>
          <dd className="font-medium">
            {fmtDate(result.service_date_min)} → {fmtDate(result.service_date_max)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Último payment date</dt>
          <dd className="font-medium">{fmtDate(result.payment_date_max)}</dd>
        </div>
      </dl>

      {result.parse_errors.length > 0 ? (
        <details className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-2">
          <summary className="cursor-pointer text-xs text-[var(--text-muted)]">
            Ver {result.parse_errors.length} error{result.parse_errors.length === 1 ? '' : 'es'} de
            parse
          </summary>
          <ul className="mt-2 space-y-0.5 text-xs text-[var(--text)]/80">
            {result.parse_errors.slice(0, 50).map((e) => (
              <li key={`${e.line}-${e.reason}`}>
                <span className="text-[var(--text-muted)]">línea {e.line}:</span> {e.reason}
              </li>
            ))}
            {result.parse_errors.length > 50 ? (
              <li className="text-[var(--text-muted)]">
                … y {result.parse_errors.length - 50} errores más.
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}

      <p className="text-xs text-[var(--text-muted)]">
        Tras este upload, las reservas con cobertura completa via CSV salen del listado de
        &quot;Pendientes online&quot; del dashboard automáticamente (cuando S2-CSV-B mergee).
      </p>
    </div>
  );
}
