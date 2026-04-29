/**
 * Shared helpers for a11y smoke tests (ADR-020 audit / a11y-baseline Sprint 2).
 *
 * Wraps `@axe-core/playwright` with the WCAG tag set we enforce as
 * baseline. Tests fail when axe reports `critical` or `serious`
 * violations; `moderate` and `minor` are logged but pass.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const BASELINE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

export type AuditOptions = {
  /** Disable specific rules by id. Use sparingly with a comment justifying. */
  disableRules?: string[];
  /** Restrict the audit to a CSS selector (e.g. main content, skip nav). */
  include?: string;
  /** Tags override. Default: WCAG 2.1 A + AA. */
  tags?: readonly string[];
};

/**
 * Run axe-core on the current page and assert no critical/serious violations.
 *
 * Report format on failure: each violation includes id, impact, help URL,
 * and the element selectors. Useful to triage in `playwright-report/`.
 */
export async function expectNoCriticalA11yViolations(
  page: Page,
  opts: AuditOptions = {}
): Promise<void> {
  const builder = new AxeBuilder({ page }).withTags([...(opts.tags ?? BASELINE_TAGS)]);

  if (opts.include) builder.include(opts.include);
  if (opts.disableRules?.length) builder.disableRules(opts.disableRules);

  const results = await builder.analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );

  if (blocking.length > 0) {
    const summary = blocking
      .map(
        (v) =>
          `  • [${v.impact}] ${v.id} — ${v.help}\n    ${v.helpUrl}\n    ${v.nodes.length} node(s) affected`
      )
      .join('\n');
    throw new Error(
      `axe-core found ${blocking.length} blocking a11y violation(s) (critical|serious):\n${summary}`
    );
  }

  // Moderate/minor violations are non-blocking but logged for visibility.
  const lowImpact = results.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'minor'
  );
  if (lowImpact.length > 0) {
    console.log(
      `[a11y] ${lowImpact.length} non-blocking violation(s):`,
      lowImpact.map((v) => `${v.impact}:${v.id}`).join(', ')
    );
  }

  expect(blocking).toHaveLength(0);
}
