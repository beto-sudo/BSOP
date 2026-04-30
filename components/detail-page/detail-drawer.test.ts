import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Source-level invariants for `<DetailDrawer>` (ADR-018, ADR-026).
 *
 * Why source-level instead of render-based: this repo's test setup is
 * env=node with no jsdom or @testing-library/react. Adding those for a
 * single regression guard isn't worth it. Reading the source string and
 * asserting on critical strings is a pragmatic compromise that catches
 * the specific bugs we want to prevent (PR #350, see CLAUDE.md "Reglas UI").
 *
 * If these tests start being noisy (flaky on whitespace changes, etc.) it's
 * a signal to invest in proper component testing.
 */

const drawerPath = path.resolve(__dirname, 'detail-drawer.tsx');
const source = readFileSync(drawerPath, 'utf8');

describe('<DetailDrawer> source invariants', () => {
  it('body wrapper is a flex-col container so children with flex-1 inherit constrained height', () => {
    // Regression guard for PR #350: dropping `flex flex-col` here breaks
    // <ScrollArea flex-1> raw inside the drawer body — it loses its height
    // context and the drawer stops scrolling when content overflows.
    expect(source).toMatch(/flex-1 min-h-0 flex flex-col/);
  });

  it('header reserves padding-right for the native X close button (DD7)', () => {
    // ADR-026 DD7: the SheetContent ships with an absolute X at top-3 right-3
    // (28×28). The header must keep `pr-14` on the SheetHeader so neither
    // the title nor the actions collide with it.
    expect(source).toMatch(/pr-14/);
  });

  it('title clamps to 2 lines and breaks long words (DD8)', () => {
    // ADR-026 DD8: prevents the title from invading the X area or growing
    // unbounded when given a long string like "Editar Documento Legal · Acta Constitutiva".
    expect(source).toMatch(/line-clamp-2 break-words/);
  });

  it('actions are visible on mobile (no `hidden sm:flex`) — DD9', () => {
    // ADR-026 DD9: actions stack vertically on mobile, never disappear.
    // If `hidden sm:flex` reappears here, mobile users lose primary actions.
    expect(source).not.toMatch(/hidden sm:flex/);
  });

  it('exports DetailDrawerSection (DD10)', () => {
    expect(source).toMatch(/export function DetailDrawerSection/);
  });

  it('exports DetailDrawerSkeleton (DD11)', () => {
    expect(source).toMatch(/export function DetailDrawerSkeleton/);
  });

  it('print stylesheet by construction (DD5): no max-w + no padding when printing', () => {
    expect(source).toMatch(/print:max-w-full/);
    expect(source).toMatch(/print:p-0/);
  });
});
