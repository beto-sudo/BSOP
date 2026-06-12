import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renderer canónico del markdown del manual (iniciativa `manual-usuario`).
 *
 * Es LA pieza que mantiene una sola fuente de verdad (D1/ADR-043 M1): el
 * mismo componente renderiza la ayuda contextual (`<HelpDrawer>`, client) y
 * la vista imprimible `/dilesa/manual/imprimir` (server component → el PDF
 * sale de aquí vía print del browser). Sin `'use client'` a propósito:
 * react-markdown v9 es puro/síncrono, así que en la vista imprimible corre
 * como RSC (cero JS al cliente) y en el drawer se bundlea como parte del
 * client component que lo importa.
 *
 * Si agregas soporte para un elemento markdown nuevo, hazlo AQUÍ — nunca en
 * un renderer paralelo (drift drawer vs PDF).
 */

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-lg font-semibold text-[var(--text)] first:mt-0 print:break-after-avoid print:text-black">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-base font-semibold text-[var(--text)] first:mt-0 print:break-after-avoid print:text-black">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-sm font-semibold text-[var(--text)] print:break-after-avoid print:text-black">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed text-[var(--text)]/90">{children}</p>,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed text-[var(--text)]/90">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-blue-600 underline underline-offset-2 dark:text-blue-400 print:text-black print:no-underline"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-[var(--border)] pl-3 text-[var(--text)]/70">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  tr: ({ children }) => <tr className="print:break-inside-avoid">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-[var(--border)] px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--border)] px-2 py-1 align-top">{children}</td>
  ),
  hr: () => <hr className="my-4 border-[var(--border)]" />,
};

/** Cuerpo markdown del manual con los estilos canónicos (pantalla + print). */
export function ManualMarkdown({ body }: { body: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
