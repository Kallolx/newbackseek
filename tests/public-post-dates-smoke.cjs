const assert = require('node:assert/strict');
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';
  const posts = [
    { id: '1', title: 'First example', description: 'Example description', age: 25, location: 'Auburn', created_at: '2026-09-12T18:00:00Z' },
    { id: '2', title: 'Second example', description: 'Example description', age: 26, location: 'Auburn', created_at: '2026-09-12T12:00:00Z' },
    { id: '3', title: 'Third example', description: 'Example description', age: 27, location: 'Auburn', created_at: '2026-09-11T22:00:00Z' },
  ];
  try {
    for (const width of [390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route('**/api/ads?*', route => route.fulfill({ json: { posts, hasMore: false } }));
      const page = await context.newPage();
      await page.goto(`${base}/browse/us/alabama/auburn/automotive-services`, { waitUntil: 'domcontentloaded' });
      for (const view of ['List', 'Gallery']) {
        if (view === 'Gallery') await page.getByRole('button', { name: 'Gallery', exact: true }).click();
        const dates = page.locator('.post-list .post-date-divider');
        await dates.first().waitFor();
        assert.deepEqual(await dates.allTextContents(), ['12 Sep, 2026', '11 Sep, 2026']);
        assert.deepEqual(await dates.locator('time').evaluateAll(nodes => nodes.map(node => node.dateTime)), ['2026-09-12', '2026-09-11']);
        assert.equal(await page.locator('.post-list .post-card-heading').count(), 3);
        assert.notEqual(await dates.first().evaluate(node => getComputedStyle(node).borderLeftWidth), '0px');
        if (view === 'Gallery') {
          const divider = await dates.first().boundingBox();
          const list = await page.locator('.post-list').boundingBox();
          assert.ok(divider.width > list.width * 0.9, 'Gallery date divider spans the grid');
        }
        console.log(`${width}px ${view}: two dated groups, three ads, visible vertical line`);
      }
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
