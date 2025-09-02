"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";

type CompanyDTO = {
  id: string;
  slug: string;
  name: string;        // comercial
  legalName?: string;  // razón social
  rfc?: string;
  email?: string;
  phone?: string;
  address?: any;       // puede venir string o json
  active?: boolean;
};

type FormState = {
  name: string;
  legalName: string;
  rfc: string;
  email: string;
  phone: string;
  // En el form usamos SIEMPRE string para address (si es json, lo mostramos pretty)
  address: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  legalName: "",
  rfc: "",
  email: "",
  phone: "",
  address: "",
  active: true,
};

function toAddressString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function dtoToForm(dto: CompanyDTO): FormState {
  return {
    name: dto.name || "",
    legalName: dto.legalName || "",
    rfc: dto.rfc || "",
    email: dto.email || "",
    phone: dto.phone || "",
    address: toAddressString(dto.address),
    active: !!dto.active,
  };
}

export default function CompanyPage() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = (params.get("company") || "").toLowerCase();

  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  // Carga inicial
  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setOk(null);
      if (!slug) {
        setError("Falta el parámetro ?company=SLUG");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/admin/company?company=${encodeURIComponent(slug)}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || "No pude cargar la empresa");
        }
        if (!cancelled) {
          const dto = json as CompanyDTO;
          setForm(dtoToForm(dto));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "No pude cargar la empresa");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Handler de guardar: hace PUT y REPUEBLA con lo que regresa el server
  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(null);

    try {
      const res = await fetch(`/api/admin/company?company=${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "No pude guardar");
      }

      // Esperamos { ok: true, company }
      const dto: CompanyDTO | undefined = json?.company;
      if (dto) {
        setForm(dtoToForm(dto)); // <- REPUEBLA
      }

      setOk("Guardado");
      // Si usas router.refresh() para otros componentes, hazlo DESPUÉS de repoblar:
      // router.refresh();
    } catch (e: any) {
      setError(e?.message || "No pude guardar");
    } finally {
      setSaving(false);
    }
  }

  // Helpers para controlar cada input
  function upd<K extends keyof FormState>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      setForm((f) => ({ ...f, [key]: v }));
    };
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">Configuración · Empresa</h1>

      {!slug && (
        <div className="rounded-md bg-red-50 text-red-700 px-4 py-3 mb-4">
          Falta el parámetro <code>?company=SLUG</code>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 text-red-700 px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {ok && (
        <div className="rounded-md bg-green-50 text-green-700 px-4 py-3 mb-4">
          {ok}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500">Cargando…</div>
      ) : (
        <form onSubmit={onSave} className="space-y-6 max-w-4xl">
          {/* Nombre comercial */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Nombre (comercial)
              </label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.name}
                onChange={upd("name")}
                placeholder="Autos del Norte"
              />
            </div>

            {/* Razón social */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Razón social
              </label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.legalName}
                onChange={upd("legalName")}
                placeholder="Autos del Norte SA de CV"
              />
            </div>
          </div>

          {/* RFC / Email */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">RFC</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.rfc}
                onChange={upd("rfc")}
                placeholder="XAXX010101000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.email}
                onChange={upd("email")}
                placeholder="contacto@empresa.com"
                type="email"
              />
            </div>
          </div>

          {/* Teléfono */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Teléfono</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.phone}
                onChange={upd("phone")}
                placeholder="5555555555"
              />
            </div>
          </div>

          {/* Dirección (string o JSON) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Dirección (texto o JSON)
            </label>
            <textarea
              className="w-full min-h-[120px] rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              value={form.address}
              onChange={upd("address")}
              placeholder='{"street":"Av. Siempre Viva", "city":"CDMX"}'
            />
            <p className="text-xs text-slate-500 mt-1">
              Puedes pegar JSON; el servidor lo transformará a <code>jsonb</code> si es válido.
            </p>
          </div>

          {/* Activa */}
          <div className="flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((f) => ({ ...f, active: e.target.checked }))
              }
              className="h-4 w-4"
            />
            <label htmlFor="active" className="text-sm">
              Empresa activa
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 text-white px-4 py-2 disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
