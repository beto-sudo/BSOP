// app/(app)/page.tsx
export default function Home() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">BSOP</h1>
      <p className="text-slate-600">
        Selecciona una empresa en el selector del menú lateral. Si no eliges ninguna,
        se aplica el branding general de BSOP.
      </p>
    </div>
  );
}
