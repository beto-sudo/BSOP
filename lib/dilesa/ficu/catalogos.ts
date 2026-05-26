/**
 * Catálogos canónicos del FICU DILESA.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 7c-2. Estos valores son las
 * únicas opciones aceptadas por el form de Fase 1 (Solicitud de Asignación)
 * y por el EBR (`riesgo.ts`). Los strings tienen que matchear EXACTO los
 * branches del scoring — cualquier cambio de etiqueta tira el cálculo a
 * "Medio" defensivo.
 *
 * Referencia: tablas de Coda DILESA · FICU (compartidas por Beto 2026-05-26).
 */

// ── Personalidad ────────────────────────────────────────────────────────────
// Mapea al campo `erp.personas.tipo_persona` que ya existe en DB con valores
// `fisica` / `moral` (lowercase). Las labels son para UI; el value es lo que
// se guarda y lo que lee `nivelPersonalidad()` del EBR.

export const TIPO_PERSONA_OPTIONS = [
  { value: 'fisica', label: 'Persona Física' },
  { value: 'moral', label: 'Persona Moral' },
] as const;

export type TipoPersona = (typeof TIPO_PERSONA_OPTIONS)[number]['value'];

// ── Nacionalidad ────────────────────────────────────────────────────────────
// Lista corta con default `Mexicana` (cubre >99% de los clientes DILESA).
// Cualquier otra nacionalidad cae a "Otra" + texto libre; el EBR la trata
// como Medio salvo que esté en `GAFI_ALTO_RIESGO_2026` (ver riesgo.ts).

export const NACIONALIDAD_OPTIONS = [
  'Mexicana',
  'Estadounidense',
  'Canadiense',
  'Española',
  'Otra',
] as const;

export type Nacionalidad = (typeof NACIONALIDAD_OPTIONS)[number];

// ── Forma de Pago ──────────────────────────────────────────────────────────
// Strings tienen que matchear los branches de `nivelFormaPago()` —
// Hipotecario/Infonavit/Fovissste → Bajo, Recursos propios → Medio,
// Efectivo significativo → Alto.

export const FORMA_PAGO_OPTIONS = [
  'Crédito Hipotecario',
  'Infonavit',
  'Fovissste',
  'Recursos Propios (transferencia)',
  'Recursos Propios (cheque)',
  'Efectivo',
  'Mixto',
] as const;

export type FormaPago = (typeof FORMA_PAGO_OPTIONS)[number];

// ── Uso de Efectivo ────────────────────────────────────────────────────────
// Strings deben matchear el regex de `nivelUsoEfectivo()`. El umbral
// monetario lo decide el cálculo cuando se captura `monto_efectivo_mxn`
// (no en v1 — por ahora solo categórico).

export const USO_EFECTIVO_OPTIONS = [
  'Sin uso de efectivo',
  'Uso de efectivo menor a 1,605 UMAs (~$181,590)',
  'Uso de efectivo mayor a 1,605 UMAs (~$181,590)',
  'Uso de efectivo mayor a 3,210 UMAs (~$363,179) — Requiere identificación',
] as const;

export type UsoEfectivo = (typeof USO_EFECTIVO_OPTIONS)[number];

// ── Conocimiento Dueño Beneficiario ────────────────────────────────────────
// Per LFPIORPI: declaración del cliente. En residencial casi siempre "No"
// (el cliente es el dueño beneficiario final, no hay tercero). Si "Sí"
// requiere captura adicional fuera de v1. Beto confirmó: solo "No" en v1.

export const CONOCIMIENTO_DUENO_BENEFICIARIO_OPTIONS = ['No'] as const;

export type ConocimientoDuenoBeneficiario =
  (typeof CONOCIMIENTO_DUENO_BENEFICIARIO_OPTIONS)[number];

// ── Estado civil ───────────────────────────────────────────────────────────
// Mapea al campo `erp.personas.estado_civil` existente. Adicional al básico
// "Casado", desglosa por régimen porque afecta la titularidad notarial.

export const ESTADO_CIVIL_OPTIONS = [
  'Soltero',
  'Casado por sociedad conyugal',
  'Casado por separación de bienes',
  'Unión libre',
  'Divorciado',
  'Viudo',
] as const;

export type EstadoCivil = (typeof ESTADO_CIVIL_OPTIONS)[number];

// ── Tipo de identificación oficial ─────────────────────────────────────────

export const TIPO_IDENTIFICACION_OPTIONS = [
  { value: 'INE', label: 'INE / Credencial para votar', autoridad: 'INE' },
  { value: 'PASAPORTE', label: 'Pasaporte', autoridad: 'SRE' },
  { value: 'CEDULA', label: 'Cédula profesional', autoridad: 'SEP' },
  { value: 'OTRO', label: 'Otra', autoridad: '' },
] as const;

export type TipoIdentificacion = (typeof TIPO_IDENTIFICACION_OPTIONS)[number]['value'];

// ── Ocupación ──────────────────────────────────────────────────────────────
// Catálogo cerrado siguiendo agrupación SAT/UIF para reportes regulatorios.
// Lista pragmática: 30 ocupaciones más comunes en clientes DILESA + "Otra".
// Si Beto necesita más granular en el futuro, expandir aquí (no es schema).

export const OCUPACION_OPTIONS = [
  // Empleados
  'Empleado del sector privado',
  'Empleado del sector público / gobierno',
  'Empleado de la industria petrolera',
  'Maestro / Docente',
  'Médico',
  'Enfermero/a',
  'Ingeniero',
  'Arquitecto',
  'Abogado',
  'Contador',
  'Administrador',

  // Empresarios / Independientes
  'Empresario',
  'Comerciante',
  'Profesionista independiente',
  'Agricultor',
  'Ganadero',
  'Transportista',

  // Operativos
  'Obrero / Operador',
  'Técnico',
  'Vendedor / Asesor de ventas',
  'Chofer',
  'Albañil / Construcción',

  // Servicios
  'Restaurantero',
  'Estilista / Belleza',
  'Mecánico',

  // No económicamente activos
  'Jubilado / Pensionado',
  'Estudiante',
  'Ama de casa / Hogar',
  'Desempleado',

  // Catch-all
  'Otra',
] as const;

export type Ocupacion = (typeof OCUPACION_OPTIONS)[number];
