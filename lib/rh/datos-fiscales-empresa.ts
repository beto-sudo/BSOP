/**
 * Datos fiscales de empresa requeridos para alta de empleados y para
 * generar contratos/finiquitos.
 *
 * Política (Beto, 2026-04-27): no hay alta de empleado ni generación de
 * contrato sin que la empresa tenga su CSF cargada y los datos fiscales
 * en orden. El fallback `PATRON_DILESA` que existía antes se eliminó —
 * cada empresa debe capturar sus propios datos antes de usar RH formal.
 *
 * Los datos viven en `core.empresas` (ver `supabase/SCHEMA_REF.md`):
 *   - razon_social, rfc, registro_patronal_imss, representante_legal
 *   - escritura_constitutiva (jsonb), escritura_poder (jsonb)
 *   - domicilio_calle/numero_ext/colonia/cp/municipio/estado
 */
import { useEffect, useState } from 'react';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import type { ContratoPatron } from '@/components/rh/contrato-printable';

export interface DatosFiscalesEmpresaRow {
  razon_social: string | null;
  rfc: string | null;
  registro_patronal_imss: string | null;
  representante_legal: string | null;
  escritura_constitutiva: EscrituraJsonb | null;
  escritura_poder: EscrituraJsonb | null;
  domicilio_calle: string | null;
  domicilio_numero_ext: string | null;
  domicilio_numero_int: string | null;
  domicilio_colonia: string | null;
  domicilio_cp: string | null;
  domicilio_municipio: string | null;
  domicilio_estado: string | null;
}

export type EscrituraJsonb = {
  numero?: string | null;
  fecha?: string | null;
  fecha_texto?: string | null;
  notario?: string | null;
  notaria_numero?: string | null;
  distrito?: string | null;
};

const REQUIRED_TOP_FIELDS: Array<{
  key: keyof DatosFiscalesEmpresaRow;
  label: string;
}> = [
  { key: 'razon_social', label: 'Razón social' },
  { key: 'rfc', label: 'RFC' },
  { key: 'registro_patronal_imss', label: 'Registro patronal IMSS' },
  { key: 'representante_legal', label: 'Representante legal' },
  { key: 'domicilio_calle', label: 'Domicilio: calle' },
  { key: 'domicilio_colonia', label: 'Domicilio: colonia' },
  { key: 'domicilio_cp', label: 'Domicilio: C.P.' },
  { key: 'domicilio_municipio', label: 'Domicilio: municipio' },
  { key: 'domicilio_estado', label: 'Domicilio: estado' },
];

const REQUIRED_ESCRITURA_FIELDS: Array<{ key: keyof EscrituraJsonb; label: string }> = [
  { key: 'numero', label: 'número' },
  { key: 'notario', label: 'notario' },
  { key: 'notaria_numero', label: 'número de notaría' },
  { key: 'distrito', label: 'distrito notarial' },
];

function isBlank(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

function escrituraFaltantes(
  obj: EscrituraJsonb | null,
  prefix: 'Escritura constitutiva' | 'Poder del representante'
): string[] {
  const out: string[] = [];
  if (!obj || typeof obj !== 'object') {
    out.push(prefix);
    return out;
  }
  for (const f of REQUIRED_ESCRITURA_FIELDS) {
    if (isBlank(obj[f.key])) out.push(`${prefix}: ${f.label}`);
  }
  // Fecha: aceptamos `fecha_texto` (legible) o `fecha` (ISO).
  if (isBlank(obj.fecha_texto) && isBlank(obj.fecha)) {
    out.push(`${prefix}: fecha`);
  }
  return out;
}

/**
 * Devuelve la lista de campos faltantes para que la empresa pueda usar
 * RH formal (alta de empleado, contrato, finiquito). Lista vacía = OK.
 */
export function camposFaltantes(d: DatosFiscalesEmpresaRow | null): string[] {
  if (!d) return ['Datos fiscales de la empresa no capturados'];
  const out: string[] = [];
  for (const f of REQUIRED_TOP_FIELDS) {
    if (isBlank(d[f.key])) out.push(f.label);
  }
  out.push(...escrituraFaltantes(d.escritura_constitutiva, 'Escritura constitutiva'));
  out.push(...escrituraFaltantes(d.escritura_poder, 'Poder del representante'));
  return out;
}

export function tieneDatosCompletos(d: DatosFiscalesEmpresaRow | null): boolean {
  return camposFaltantes(d).length === 0;
}

/**
 * Construye el `ContratoPatron` para los printables. Sólo debe llamarse
 * cuando `tieneDatosCompletos(d)` es true; si faltan campos, lanza para
 * forzar al caller a manejar el caso "datos incompletos" antes.
 */
export function buildPatronFromDatos(d: DatosFiscalesEmpresaRow): ContratoPatron {
  const faltantes = camposFaltantes(d);
  if (faltantes.length > 0) {
    throw new Error(
      `Datos fiscales de la empresa incompletos: ${faltantes.join(', ')}. ` +
        'Captúralos en Configuración → Empresas antes de generar contrato/finiquito.'
    );
  }
  const ec = d.escritura_constitutiva as EscrituraJsonb;
  const ep = d.escritura_poder as EscrituraJsonb;
  const domParts = [
    d.domicilio_calle,
    d.domicilio_numero_ext ? `#${d.domicilio_numero_ext}` : null,
    d.domicilio_numero_int ? `Int. ${d.domicilio_numero_int}` : null,
    d.domicilio_colonia ? `Col. ${d.domicilio_colonia}` : null,
    d.domicilio_cp ? `C.P. ${d.domicilio_cp}` : null,
    d.domicilio_municipio,
    d.domicilio_estado,
  ].filter(Boolean) as string[];
  const razon = d.razon_social as string;
  return {
    razonSocial: /S\.A\.|SA DE CV/i.test(razon) ? razon : `${razon}, S.A. DE C.V.`,
    rfc: d.rfc as string,
    domicilio: domParts.join(', '),
    registroPatronalImss: d.registro_patronal_imss as string,
    representanteLegal: d.representante_legal as string,
    escrituraConstitutiva: {
      numero: ec.numero as string,
      fecha: (ec.fecha_texto ?? ec.fecha) as string,
      notario: ec.notario as string,
      notariaNumero: ec.notaria_numero as string,
      distrito: ec.distrito as string,
    },
    poderRepresentante: {
      numero: ep.numero as string,
      fecha: (ep.fecha_texto ?? ep.fecha) as string,
      notario: ep.notario as string,
      notariaNumero: ep.notaria_numero as string,
      distrito: ep.distrito as string,
    },
  };
}

const SELECT_COLUMNS =
  'razon_social, rfc, registro_patronal_imss, representante_legal, ' +
  'escritura_constitutiva, escritura_poder, ' +
  'domicilio_calle, domicilio_numero_ext, domicilio_numero_int, ' +
  'domicilio_colonia, domicilio_cp, domicilio_municipio, domicilio_estado';

export type DatosFiscalesState = {
  loading: boolean;
  datos: DatosFiscalesEmpresaRow | null;
  faltantes: string[];
  completo: boolean;
};

const PENDING_STATE: DatosFiscalesState = {
  loading: true,
  datos: null,
  faltantes: [],
  completo: false,
};

/**
 * Hook React para leer los datos fiscales de una empresa desde
 * `core.empresas` y exponer su estado de completitud. Pasa `null` para
 * el caso "todavía no se conoce la empresa" (devuelve `PENDING_STATE`
 * sin disparar la query).
 */
export function useDatosFiscalesEmpresa(empresaId: string | null): DatosFiscalesState {
  const [state, setState] = useState<DatosFiscalesState>(PENDING_STATE);

  useEffect(() => {
    if (!empresaId) return;
    let cancelled = false;
    const supabase = createSupabaseERPClient();
    void (async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('empresas')
        .select(SELECT_COLUMNS)
        .eq('id', empresaId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setState({
          loading: false,
          datos: null,
          faltantes: ['No se pudieron leer los datos fiscales de la empresa'],
          completo: false,
        });
        return;
      }
      const row = (data ?? null) as DatosFiscalesEmpresaRow | null;
      const faltantes = camposFaltantes(row);
      setState({
        loading: false,
        datos: row,
        faltantes,
        completo: faltantes.length === 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [empresaId]);

  // Cuando no hay empresaId, devolvemos el estado pendiente directo —
  // así el caller ve consistencia (loading:true) y evitamos resetear
  // setState dentro del effect (anti-patrón react-hooks/set-state-in-effect).
  // Si empresaId cambia de "uuid" a null el state interno queda con los
  // datos viejos, pero el guard de aquí los oculta.
  return empresaId ? state : PENDING_STATE;
}
