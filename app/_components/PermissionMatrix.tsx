"use client";

import { useEffect, useMemo, useState } from "react";

type Item = { module_key: string; permission_key: string; allowed: boolean };
type Props = {
  modules: Array<{ key: string; label: string }>;
  permissions: Array<{ key: string; label: string }>;
  value: Item[];
  onChange?: (items: Item[]) => void;
};

export default function PermissionMatrix({ modules, permissions, value, onChange }: Props) {
  const [items, setItems] = useState<Item[]>(value);
  useEffect(() => setItems(value), [value]);

  const map = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const it of items) m.set(`${it.module_key}:${it.permission_key}`, !!it.allowed);
    return m;
  }, [items]);

  function toggle(module_key: string, permission_key: string) {
    const k = `${module_key}:${permission_key}`;
    const current = map.get(k) ?? false;
    const next = !current;
    const updated = items.filter((x) => !(x.module_key === module_key && x.permission_key === permission_key));
    updated.push({ module_key, permission_key, allowed: next });
    setItems(updated);
    onChange?.(updated);
  }

  return (
    <div className="w-full overflow-auto border rounded-lg">
      <table className="min-w-[700px] w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">Módulo</th>
            {permissions.map((p) => (
              <th key={p.key} className="px-3 py-2">{p.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <tr key={m.key} className="border-t">
              <td className="px-3 py-2 font-medium">{m.label}</td>
              {permissions.map((p) => {
                const k = `${m.key}:${p.key}`;
                const checked = map.get(k) ?? false;
                return (
                  <td key={p.key} className="px-3 py-2 text-center">
                    <input type="checkbox" checked={checked} onChange={() => toggle(m.key, p.key)} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
