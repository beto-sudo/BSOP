/**
 * Shared helper — skips a test when no auth credentials were configured.
 * Call inside test.beforeEach() for every auth-gated spec file.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TestInfo } from '@playwright/test';

const AUTH_FILE = path.join(__dirname, '../../../playwright/.auth/user.json');

export function skipIfNoAuth(testInfo: TestInfo) {
  let hasAuth = false;
  try {
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as {
      cookies?: unknown[];
      origins?: Array<{ localStorage?: unknown[] }>;
    };
    const hasCookies = (state.cookies?.length ?? 0) > 0;
    const hasStorage = (state.origins ?? []).some(
      (o) => (o.localStorage?.length ?? 0) > 0
    );
    hasAuth = hasCookies || hasStorage;
  } catch {
    /* file doesn't exist yet */
  }

  if (!hasAuth) {
    testInfo.skip(
      true,
      'No auth credentials — add TEST_USER_EMAIL + TEST_USER_PASSWORD to .env.test.local'
    );
  }
}
