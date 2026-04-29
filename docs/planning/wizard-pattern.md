# Iniciativa — Wizard pattern (multi-step forms)

**Slug:** `wizard-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-29
**Última actualización:** 2026-04-29

> Spin-out de `forms-pattern` Sprint 6. La evaluación de
> `empleado-alta-wizard.tsx` (1329 líneas) confirmó que un wizard de N
> pasos requiere API materialmente distinta del `<Form>` de v1, y
> arrastra `file-attachments` (iniciativa hermana). Se separa para no
> contaminar el API simple de `forms-pattern`.

## Problema

El repo tiene un solo wizard hoy: `components/rh/empleado-alta-wizard.tsx`
(alta de empleado, 3 pasos: identidad → puesto+contrato → expediente).
Es masivo (1329 líneas) y mezcla:

- 3 step state machines (índice de paso, navegación back/next, validación
  por paso antes de avanzar).
- ~30 useState per-field para datos personales, domicilio, contacto
  emergencia, puesto/depto, compensación con SDI auto-calculado, hasta
  N beneficiarios dinámicos.
- File uploads con storage Supabase (foto, INE, CURP, acta, domicilio,
  CSF, IMSS) — varios obligatorios, condicional por "primer empleo".
- Inserción multi-tabla en secuencia con rollback best-effort.

El v1 de `forms-pattern` (ADR-016) cubre forms single-step. Forzar este
wizard al `<Form>` de v1 contamina la API porque:

- El submit final no es un único `onSubmit` — es secuencial (4-5 inserts
  - uploads, cualquiera puede fallar y necesitar rollback).
- Cada paso valida antes de avanzar, no solo al final.
- El "dirty confirm" tiene que considerar progreso parcial: cerrar a
  mitad del paso 2 perdiendo beneficiarios + archivos subidos.
- Beneficiarios dinámicos (1..N) usan `useFieldArray` — feature de RHF
  que `<Form>` v1 no expuso explícitamente.

## Outcome esperado

- Componente `<Wizard>` con N pasos navegables (back/next), cada paso
  con su propio schema zod local.
- Submit final atómico-ish (pre-validación de los N pasos antes de
  hacer cualquier mutation).
- Soporte para `useFieldArray` (beneficiarios, contactos, etc.).
- File uploads dentro del flow, integrados con `file-attachments` pattern
  (cuando esa iniciativa cierre).
- Migración del único caso real (`empleado-alta-wizard`) como golden.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Decidir API: ¿`<Wizard steps={[...]} />` con array de schemas y
      renderers? ¿`<WizardStep>` declarativo en children? ¿Hook
      `useWizard()` que devuelve helpers + el componente lo arma?
- [ ] Decidir storage del state inter-pasos: ¿un solo `useForm` global
      con schema unificado y validación parcial por paso? ¿N `useForm`
      independientes con sync manual? Probable: 1 form global, validación
      parcial via `trigger()` por paso.
- [ ] `useFieldArray` integration para beneficiarios.
- [ ] Submit pipeline: pre-validar todos los pasos, ejecutar mutations
      secuenciales, manejar rollback best-effort. Probable: callback
      `onSubmit(values)` que el caller implementa con su propia secuencia
      transaccional.
- [ ] Migrar `empleado-alta-wizard` como golden path.

## Fuera de alcance v1

- **Wizards con branching condicional** ("si seleccionas X, sigue al
  paso Y; si no, salta al paso Z"). Patrón lineal solo; branching se
  evalúa cuando aparezca un caso real.
- **Persistencia de progreso** (draft entre sesiones). Postergable.
- **Validación cruzada inter-paso** beyond zod refines locales. Si surge
  necesidad, schema unificado al final.

## Bloqueos

- Depende parcialmente de **`file-attachments`**: si el wizard incluye
  uploads, idealmente esa iniciativa cierra primero para no inventar
  otra API de file inputs aquí. Alternativamente, `wizard-pattern` v1
  acepta file inputs como callback opaco y `file-attachments` los
  estandariza después.

## Sprints / hitos

_(se llena cuando arranque ejecución)_

## Decisiones registradas

### 2026-04-29 · Spin-out de forms-pattern Sprint 6

`forms-pattern` v1 cubre single-step. `empleado-alta-wizard` (único caso
real) requiere API materialmente distinta y arrastra `file-attachments`.
Se separa para no contaminar el API simple de v1.

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
