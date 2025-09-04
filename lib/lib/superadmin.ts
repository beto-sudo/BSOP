// lib/superadmin.ts
export function isSuperadminEmail(email?: string | null) {
  const raw = process.env.BSOP_SUPERADMINS || "";
  const list = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}
