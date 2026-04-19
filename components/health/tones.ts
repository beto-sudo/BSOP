/**
 * Per-metric color palette used across hero cards, trend charts, and modals.
 * Each entry ships light + dark variants for the icon pill and the line/dot
 * strokes that the SVG chart renders.
 */
export const TONES = {
  sleep: {
    icon: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-400/12 dark:text-indigo-200',
    line: '#a78bfa',
    lineSoft: 'rgba(167,139,250,0.35)',
    dot: '#c4b5fd',
    badge: 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200',
  },
  hr: {
    icon: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/12 dark:text-rose-200',
    line: '#fb7185',
    lineSoft: 'rgba(251,113,133,0.35)',
    dot: '#fda4af',
    badge: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
  },
  bp: {
    icon: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/12 dark:text-blue-200',
    line: '#60a5fa',
    lineSoft: 'rgba(96,165,250,0.35)',
    dot: '#93c5fd',
    badge: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    secondary: '#38bdf8',
    secondarySoft: 'rgba(56,189,248,0.35)',
    secondaryDot: '#67e8f9',
  },
  spo2: {
    icon: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/12 dark:text-cyan-200',
    line: '#22d3ee',
    lineSoft: 'rgba(34,211,238,0.35)',
    dot: '#67e8f9',
    badge: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
  },
  steps: {
    icon: 'border-green-200 bg-green-50 text-green-700 dark:border-green-400/25 dark:bg-green-400/12 dark:text-green-200',
    line: '#4ade80',
    lineSoft: 'rgba(74,222,128,0.35)',
    dot: '#86efac',
    badge: 'border-green-400/20 bg-green-400/10 text-green-200',
  },
  weight: {
    icon: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/12 dark:text-orange-200',
    line: '#f59e0b',
    lineSoft: 'rgba(245,158,11,0.35)',
    dot: '#fbbf24',
    badge: 'border-orange-400/20 bg-orange-400/10 text-orange-200',
  },
  hrv: {
    icon: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/12 dark:text-emerald-200',
    line: '#34d399',
    lineSoft: 'rgba(52,211,153,0.35)',
    dot: '#6ee7b7',
    badge: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  },
  bodyfat: {
    icon: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/12 dark:text-amber-200',
    line: '#f59e0b',
    lineSoft: 'rgba(245,158,11,0.35)',
    dot: '#fbbf24',
    badge: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  },
  bmi: {
    icon: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-400/25 dark:bg-fuchsia-400/12 dark:text-fuchsia-200',
    line: '#d946ef',
    lineSoft: 'rgba(217,70,239,0.35)',
    dot: '#e879f9',
    badge: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200',
  },
} as const;
