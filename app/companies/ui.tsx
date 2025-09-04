"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
      try { localStorage.setItem("bsop:favs", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = companies;
    if (!t && favs.length === 0) return list;
    return list
      .filter((c) =>
        !t || c.name.toLowerCase().includes(t) || (c.slogan ?? "").toLowerCase().includes(t)
      );
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
              className="rounded-full bg-[var(--brand-800)] text-white px-3 py-2 text-xs"
            >
              Crear empresa
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-4">
        {showEmpty ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/?company=${encodeURIComponent(c.slug)}`}
                  className="group block rounded-2xl border hover:bg-[var(--brand-50)] transition-colors p-4 flex gap-3 items-center"
                >
                  <div className="h-12 w-12 rounded-xl border bg-white grid place-items-center overflow-hidden">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
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
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function FavButton({ active, onClick }: { active: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      role="button"
      onClick={onClick}
      title={active ? "Quitar de favoritos" : "Marcar favorito"}
      className={`select-none text-xs leading-none px-1.5 py-0.5 rounded ${
        active ? "bg-yellow-200 text-yellow-900" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
      }`}
    >
      ★
    </span>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-2xl border p-6 text-sm text-slate-600 bg-white">
      <p className="mb-2">{message || "No hay empresas que coincidan."}</p>
      <ul className="list-disc list-inside text-slate-500 text-xs space-y-1">
        <li>Verifica que tu usuario esté dado de alta en <code>company_member</code>.</li>
        <li>El campo <code>company_member.user_id</code> debe apuntar a <code>public.profile.id</code> de tu usuario.</li>
        <li>Si usas invitaciones, acepta la invitación o pide a un admin que te agregue.</li>
      </ul>
    </div>
  );
}
