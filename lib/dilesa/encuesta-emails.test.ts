import { describe, expect, it } from 'vitest';
import {
  renderEncuestaEmail,
  renderAvisoAtencion,
  type EncuestaEmailContext,
  type AvisoAtencionContext,
} from './encuesta-emails';
import type { EmpresaBranding } from './email-branding';

const branding: EmpresaBranding = {
  empresaId: 'e-1',
  nombreComercial: 'DILESA',
  headerUrl: null,
  colorPrimario: '#7D812E',
  colorSecundario: '#4F4C4D',
  colorInverso: '#FFFFFF',
} as EmpresaBranding;

const ctx: EncuestaaContext = {
  clienteEmail: 'cliente@example.com',
  clienteNombre: 'Luis Gerardo Arizpe',
  proyectoNombre: 'Lomas del Sol',
  encuestaUrl: 'https://bsop.io/dilesa/encuesta/tok123',
  branding,
};
type EncuestaaContext = EncuestaEmailContext;

describe('renderEncuestaEmail', () => {
  it('inicial: incluye liga, nombre y proyecto', () => {
    const { subject, html } = renderEncuestaEmail(ctx, 'inicial');
    expect(subject).toContain('1 minuto');
    expect(html).toContain('https://bsop.io/dilesa/encuesta/tok123');
    expect(html).toContain('Luis Gerardo Arizpe');
    expect(html).toContain('Lomas del Sol');
    expect(html).toContain('ENCUESTA DE CONFORMIDAD');
  });

  it('las 3 variantes tienen subject e intro distintos', () => {
    const subjects = new Set(
      (['inicial', 'recordatorio', 'ultimo'] as const).map(
        (v) => renderEncuestaEmail(ctx, v).subject
      )
    );
    expect(subjects.size).toBe(3);
  });

  it('sin proyecto: no rompe ni deja "en null"', () => {
    const { html } = renderEncuestaEmail({ ...ctx, proyectoNombre: null }, 'recordatorio');
    expect(html).not.toContain('en null');
    expect(html).toContain('Luis Gerardo Arizpe');
  });

  it('escapa HTML en datos del cliente', () => {
    const { html } = renderEncuestaEmail({ ...ctx, clienteNombre: 'A <script>' }, 'inicial');
    expect(html).not.toContain('<script>');
  });
});

describe('renderAvisoAtencion', () => {
  const aviso: AvisoAtencionContext = {
    destinatarios: ['edgar@dilesa.mx'],
    clienteNombre: 'Luis Gerardo Arizpe',
    clienteTelefono: '878-000-0000',
    proyectoNombre: 'Lomas del Sol',
    unidadIdentificador: 'M13-L11-LDS',
    capturaUrl: 'https://bsop.io/dilesa/ventas/v-1/capturar/16-conformidad',
    branding,
  };

  it('incluye referencia, teléfono y liga a la captura', () => {
    const { subject, html } = renderAvisoAtencion(aviso);
    expect(subject).toContain('Luis Gerardo Arizpe');
    expect(subject).toContain('Lomas del Sol · M13-L11-LDS');
    expect(html).toContain('878-000-0000');
    expect(html).toContain('/capturar/16-conformidad');
  });

  it('sin teléfono ni unidad: subject solo con nombre', () => {
    const { subject, html } = renderAvisoAtencion({
      ...aviso,
      clienteTelefono: null,
      proyectoNombre: null,
      unidadIdentificador: null,
    });
    expect(subject).toBe('Encuesta sin respuesta — Luis Gerardo Arizpe');
    expect(html).toContain('capturar sus respuestas');
  });
});
