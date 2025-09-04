// app/companies/ui.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CompanyCard = { id: string; name: string; slug: string; logoUrl?: string; slogan?: string };

export default function CompaniesClient({
  companies,
  emptyMessage,
}: {
  companies: CompanyCard[];
  emptyMessage?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bsop:favs");
      setFavs(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);

  function toggleFav(id: string) {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("bsop:favs", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = [...companies];
    list.sort((a, b) => {
      const fa = favs.includes(a.id) ? -1 : 0;
      const fb = favs.includes(b.id) ? -1 : 0;
      return fa - fb || a.name.localeCompare(b.name);
    });
    return t
      ? list.filter(
          (c) =>
            c.name.toLowerCase().includes(t) || (c.slogan ?? "").toLowerCase().includes(t)
        )
      : list;
  }, [companies, q, favs]);

  const showEmpty = filtered.length === 0;

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold">Empresas</h1>
          <div className="w-full max-w-md">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar empresa…"
              className="w-full rounded-full border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/companies"
              className="hidden sm:inline-flex rounded-full border px-3 py-2 text-xs hover:bg-slate-50"
              title="Recargar"
            >
              Recargar
            </a>
            <a
              href="/admin/companies/new"
              className="inline-flex rounded-full border px-3 py-2 text-xs bg-[var(--brand-50)] border-[var(--brand-300)] text-[var(--brand-800)] hover:bg-[var(--brand-100)]"
              title="Crear empresa"
            >
              Crear empresa
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        {showEmpty ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => router.push(`/?company=${encodeURIComponent(c.slug)}`)}
                  className="group w-full text-left rounded-2xl border bg-white hover:bg-[var(--brand-50)] transition-colors p-4 flex gap-3 items-center"
                >
                  <div className="h-12 w-12 rounded-xl border bg-white grid place-items-center overflow-hidden">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt={c.name} className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400">Logo</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{c.name}</h3>
                      <FavButton
                        active={favs.includes(c.id)}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleFav(c.id);
                        }}
                      />
                    </div>
                    {c.slogan ? (
                      <p className="truncate text-xs text-slate-500">{c.slogan}</p>
                    ) : (
                      <p className="truncate text-xs text-slate-400">—</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function FavButton({ active, onClick }: { active: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      onClick={onClick}
      title={active ? "Quitar de favoritos" : "Marcar como favorito"}
      className={`inline-flex h-6 w-6 cursor-pointer select-none items-center justify-center rounded-full border text-xs ${
        active ? "bg-[var(--brand-100)] border-[var(--brand-300)]" : "hover:bg-slate-50"
      }`}
    >
      ★
    </span>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-2xl border p-6 text-sm text-slate-600 bg-white">
      <p className="mb-2">
        {message || "No hay empresas que coincidan."}
      </p>
      <ul className="list-disc list-inside text-slate-500 text-xs space-y-1">
        <li>Verifica que tu usuario esté dado de alta en <code>company_member</code>.</li>
        <li>El campo <code>company_member.user_id</code> debe apuntar a <code>public.profile.id</code> de tu usuario.</li>
        <li>Si usas invitaciones, acepta la invitación o pide a un admin que te agregue.</li>
      </ul>
    </div>
  );
}
