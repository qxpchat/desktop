// Phase 0 smoke — the test harness can launch the daemon, navigate to
// the Vite dev server, render the app shell, tear down cleanly.

import { test, expect } from '../../fixtures/app.js';

test('app shell mounts on a fresh accounts dir', async ({ page }) => {
  // `page.goto('/')` ran in the `qxp` fixture with default
  // `waitUntil: 'load'`; before assertions ensure the SPA hydration
  // has actually had a chance to run.
  await page.waitForLoadState('domcontentloaded');

  // Static HTML check first — `<div id="app">` is in index.html, so if
  // this fails we know Vite isn't actually serving the SPA shell.
  await expect(page.locator('#app')).toHaveCount(1);

  // Title is set in `<title>qxp</title>` in index.html. If this is
  // empty, the response we got back isn't the SPA shell at all (Vite
  // mid-startup, wrong port, daemon proxy collision, etc.) — see the
  // diagnostic dump in the on-failure block.
  await expect(page).toHaveTitle(/qxp/i);

  // Once Svelte mounts, `#app` gets populated. If this fails but the
  // checks above passed, the SPA loaded but errored during hydration
  // (look at the browser console output in the Playwright trace).
  await expect(page.locator('#app')).not.toBeEmpty();
});

// If the smoke fails, dump the served HTML + console messages so the
// next bug-hunt has data instead of guesses.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const errors =
    (page as unknown as { __qxpErrors?: string[] }).__qxpErrors ?? [];
  /* eslint-disable no-console */
  console.log('--- diagnostic dump (test failed) ---');
  console.log('URL:', page.url());
  console.log('Title:', JSON.stringify(await page.title().catch(() => '<n/a>')));
  const html = await page.content().catch(() => '');
  console.log('Body length:', html.length);
  console.log('Head snippet:', html.slice(0, 400));
  console.log(`Browser console errors: ${errors.length}`);
  for (const e of errors) console.log('  ', e);
  console.log('--- end diagnostic ---');
  /* eslint-enable no-console */
});
