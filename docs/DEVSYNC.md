# BSOP – Dev Sync (contexto canónico)

## Arquitectura (resumen)
- Next.js (App Router) + TypeScript + Tailwind.
- Layout real: `app/(app)/layout.tsx` con ThemeLoader (fuente de verdad de branding).
- Sidebar: `app/_components/Sidebar.tsx` (usa `--brand-50…900`, `--brand`).

## Branding
- Página: `app/(app)/admin/branding/page.tsx`
- Funciones:
  - Sliders H/S/L → genera paleta 50–900 y aplica en vivo a `--brand-*`.
  - Subida de logo + detección de colores (client-side canvas).
- Persistencia:
  - `GET/PATCH /api/admin/company?company=...`
  - `settings.branding`: `{ brandName, primary, hue, saturation, lightness, palette, logoUrl }`
  - Upload logo: `POST /api/admin/company/logo?company=...` → `{ url }`

## Endpoints actuales
- `GET /api/companies`
- `GET /api/admin/company?company=...`
- `PATCH /api/admin/company?company=...`
- `POST /api/admin/company/logo?company=...`

## Convenciones
- Ramas: `feat/*`, `fix/*`, `chore/*`, `refactor/*`.
- No subir `.env` ni secretos. Paletas en `settings.branding.palette`.

## Próximos pasos posibles
- Color secundario + contraste AA.
- Sidebar compacto con framer-motion.
