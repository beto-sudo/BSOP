import { describe, expect, it } from 'vitest';
import { mdToHtmlFragment, mdToEmailHtml } from './markdown';

describe('daily-briefing · markdown', () => {
  it('convierte headings con nivel', () => {
    expect(mdToHtmlFragment('## Salud')).toBe('<h2>Salud</h2>');
    expect(mdToHtmlFragment('### Sub')).toBe('<h3>Sub</h3>');
  });

  it('convierte bold y code inline', () => {
    expect(mdToHtmlFragment('texto **fuerte** y `cod`')).toBe(
      '<p>texto <strong>fuerte</strong> y <code>cod</code></p>'
    );
  });

  it('agrupa bullets consecutivos en un <ul>', () => {
    const html = mdToHtmlFragment('- uno\n- dos');
    expect(html).toBe('<ul>\n<li>uno</li>\n<li>dos</li>\n</ul>');
  });

  it('agrupa lista ordenada en un <ol>', () => {
    const html = mdToHtmlFragment('1. primero\n2. segundo');
    expect(html).toBe('<ol>\n<li>primero</li>\n<li>segundo</li>\n</ol>');
  });

  it('una línea en blanco cierra la lista', () => {
    const html = mdToHtmlFragment('- uno\n\npárrafo');
    expect(html).toContain('</ul>');
    expect(html).toContain('<p>párrafo</p>');
  });

  it('convierte tablas GFM a <table>', () => {
    const md = '| Métrica | 7d | 23d |\n| --- | --- | --- |\n| RHR | 60 | 62 |';
    const html = mdToHtmlFragment(md);
    expect(html).toContain('<table');
    expect(html).toContain('<th align="left">Métrica</th>');
    expect(html).toContain('<td>RHR</td>');
    expect(html).toContain('<td>60</td>');
  });

  it('escapa HTML peligroso', () => {
    expect(mdToHtmlFragment('a < b & c > d')).toBe('<p>a &lt; b &amp; c &gt; d</p>');
  });

  it('mdToEmailHtml envuelve en body con estilo', () => {
    const html = mdToEmailHtml('## Hola');
    expect(html.startsWith('<html><body')).toBe(true);
    expect(html).toContain('<h2>Hola</h2>');
    expect(html.endsWith('</body></html>')).toBe(true);
  });
});
