# BSOP

Plataforma de gestión **multiempresa** construida con **Next.js (App Router)** y **TypeScript**. 

[![CI](https://github.com/beto-sudo/BSOP/actions/workflows/ci.yml/badge.svg)](https://github.com/beto-sudo/BSOP/actions/workflows/ci.yml)

---

## Índice
- [Contexto canónico (DEVSYNC)](#contexto-canónico-devsync)
- [Stack](#stack)
- [Estructura relevante](#estructura-relevante)
- [Primeros pasos](#primeros-pasos)
- [Variables de entorno](#variables-de-entorno)
- [Scripts](#scripts)
- [Flujo de ramas \& PRs](#flujo-de-ramas--prs)
- [Checklist de contribución](#checklist-de-contribución)

---

## Contexto canónico (DEVSYNC)

Lee **toda la convención del proyecto, rutas reales, endpoints y notas vivas** aquí:  
➡️ **[`docs/DEVSYNC.md`](./docs/DEVSYNC.md)**

---

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS**
- Gestión de branding mediante **ThemeLoader** (variables `--brand`, `--brand-50…900`)
- (Opcional) Despliegue en **Vercel**

---

## Estructura relevante

- Layout real de la app: `app/(app)/layout.tsx` (monta ThemeLoader, Sidebar, Topbar)
- Sidebar (escucha `--brand-*`): `app/_components/Sidebar.tsx`
- Branding UI (sliders H/S/L, paleta 50–900, logo y detección de colores):
  - `app/(app)/admin/branding/page.tsx`
- Endpoints usados:
  - `GET /api/companies`
  - `GET/PATCH /api/admin/company?company=...`
  - `POST /api/admin/company/logo?company=...` (logo; devolver `{ url }`)

> El detalle fino y convenciones está en [`docs/DEVSYNC.md`](./docs/DEVSYNC.md).

---

## Primeros pasos

```bash
# Node 20+ recomendado
npm i
npm run dev
# abre http://localhost:3000
