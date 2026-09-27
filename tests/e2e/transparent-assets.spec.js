import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const assets = new URL('../../public/assets/', import.meta.url);
const supplied = {
  'filling-hd.png': { size: [1355, 1160], hash: '06d9b570c5d84729c06248bdd45bef17a29f123e9c613be0f80abcb6a4da9f36' },
  'timer-frame-hd.png': { size: [1218, 1292], hash: '3348f3f47848f76ef3d12a15c5f28672c6d2d7e88fde44ecbc2afa612a9e0ec2' },
  'lid-hd.png': { size: [1536, 1024], hash: 'b2765c4d5d822409bbf3de67782c20ccc2d0f06b55c9870131099c3c4ae06f14' },
  'steamer-closed-hd.png': { size: [1278, 1230], hash: 'f35463af916ed7811105b9b80e45bd0c439c93f36dfb11b8052afe9aa84e6d5b' },
  'dough-hd.png': { size: [1339, 1175], hash: '6ba6be1d93c51f252524647938919e11a6d1ed0512c9b655c829ca1478bca473' },
  'empty-spoon-hd.png': { size: [1536, 1024], hash: '95f7f8cb4850bb6db4ce795a3b7fc081c50430d4c5e1b3080f50b2994f0850b0' },
  'steam-puff-hd.png': { size: [1350, 1165], hash: '08fa3f99e308ae67e5388806e7dcad55f46d11587f51319a4a34d3efb66ec5cf' },
  'steam-single-hd.png': { size: [1024, 1536], hash: '39f551d933d16843e17200f4e08dba5d3170060d9a5265ec4a863d0e804166ca' },
  'steamer-open-hd.png': { size: [1459, 1078], hash: 'a21fe21298bd6c1e7e7c3288a55a187bd63a83fc30b12487d4fc48c80b7f26e6' },
  'spoon-hd.png': { size: [1536, 1024], hash: 'c24c405759fae26408d1947e443a253ebc925cff58955b660500ec3bb2c9dc14' },
  'flour-cup-empty-hd.png': { size: [1402, 1122], hash: 'dc8fa534b8a3ff72d1dfa29c9d83a767c8d0d6f5a3c5d2def8ff373f65cbc745' },
  'stove-hd.png': { size: [1774, 887], hash: '96a47035de56e3710e59cb3f28be1519dcb23c11cce35971c88f2864fe112e99' },
  'flame-hd.png': { size: [1774, 887], hash: '3afe6fbdd18be97b9513f48b31307a271900cea8a1b976580a160ea841efd377' },
  'flour-particles-hd.png': { size: [1536, 1024], hash: '370f881f05b06e128bc021337e10567520f3291162f83a437884ee0b511dcf0b' },
  'jug-hd.png': { size: [1416, 1111], hash: '08e342f4679739cce7ef7396b3a966ba5fbba6085eb1807f3bf4cf9a0f3afb97' },
  'jug-empty-hd.png': { size: [1415, 1111], hash: '7985993030314ca56a004fc328c19b7f8c8afc4d5bd20f11fd9ae92ec1a42939' },
  'water-drop-hd.png': { size: [1206, 1305], hash: 'e2bbd2727bdd28f652e3245e5893874d84e740d887eff12e8d3cfc8b48ae0d28' },
  'bowl-empty-hd.png': { size: [1536, 1024], hash: '6b984067ff25bc9889e4a50f3f364db40e28a3d605e2a669c772a637beeef568' },
  'wrapper-hd.png': { size: [1536, 1024], hash: '079fe248f3fb1e175153475a3262bfdb835fcca63a3ef8afc445000b9b5909f1' },
  'cover-basket-hd.png': { size: [1366, 1151], hash: '87fbebdab0366c345ded78ad757bf574924e1f14bb600512cab64ff9aa52c493' },
};
// Captured before this integration; old scenes and earlier supplied HD images
// must retain their exact bytes even when an updated scene no longer uses them.
const unchanged = {
  'basket-front.png': '64f9da0dac5af689da1c9a792d64c81ba4e21a9584247f1b324f2023d36f91ba',
  'bowl-hd.png': '3f86210f28dc6e92dfcd790d8ce93776ba385802d4352f6afb223440d4e076fe',
  'bowl.png': 'e1560ed0a5b69bafb1771a2535ff324761a924eea698cc8dde8e05716a9d42dc',
  'bun-hd.png': '272ba195058f4d56cda1646845492d352f901077238683553d9da6b2f0928448',
  'bun.png': '5941a23e3b0f9b83f4f37bec6ef0e987b2cc5275b6fd353df7e6216a82d08da7',
  'cover-basket.png': 'b72ff662d14262437547242076219bb150b336f9e9d4ca20df028ef26871f7a8',
  'dough.png': '2b8ddfe75132e5b1fa35747d6b092b637da86981bd35b1e95bc1adcd53e7494f',
  'empty-spoon.png': '1a9d089f77a096feecc1a4b53ee618ad3174ef795952cbefa3490a4e428004c1',
  'filling.png': '347e2ea9596c687217eef839386cbb9b4c505c048e05e2096714f5c14c02ea1a',
  'finished-base.png': 'c430e7e76a258dd865a2394ce2b45b9bb77647e9bd1845dccc1ce1283ae57653',
  'finished-bun.png': '8d1b0813ca96a288f13ebf45839d832f4fab0a6656d5005c636984d7c694f8f4',
  'finished-hd.png': 'b2fba8de7595b0222700096192d786c8911257d5a18c86d392b767cf037cca51',
  'finished.png': 'b8ba54e5737e74bf37a51cfef5af11ee870d8e0dbbf92bffff0175db2156a0ce',
  'flour-cup-hd.png': '6fea33c941d4d0187968d23200ca67738f1ccaca30b0838817a383c334488cf7',
  'flour-cup.png': '0e7f8f2a7367398bb274ebe9fa8c90997eae683be265adccd9db5636c8abfd96',
  'jug.png': '2b7d55a65596835431e2fdb44451cf00cdff34765bfd02f3e30dc6e420d6f931',
  'lid.png': '61f3c34dde85183576670f0c1c94351ee189cd463dc6d854ce8d6f70a468bd67',
  'spoon.png': 'd7fb2d3bd1cc302d5b94df7966da19bb49227de44987e3bde90bfc3ca34733b0',
  'steam-puff.png': 'eeb5cd803b76942fe80dfe616f98c4a1cbac423f45478475bb602a8e5fd033dd',
  'steamer-closed.png': 'd97c096312a7afba209501c732eabf6759d3f808ad885ec36a66c8e4e069ff8e',
  'timer-frame.png': '970a5421e059b21129324a2b1890f8078d640d05740757fbef546c947f82679b',
  'water-drop.png': 'd917113b4813b8523998a9ddb0101296e55f1e0b79aae5b6078cd1406e4bdfd4',
  'wrapper.png': 'a92a852c5d12b5483f3777d9dd3d6a36d35c48a66948cde1d16839cba67286fe',
};

test.use({ reducedMotion: 'reduce' });
const shell = (page) => page.getByTestId('game-shell');
const primary = (page) => page.getByTestId('primary-action');
const next = (page) => page.getByTestId('next-action');

async function expectControl(button) {
  await expect(button).toBeVisible();
  await expect(button).toBeInViewport({ ratio: 1 });
  const measured = await button.evaluate((element) => {
    const face = element.querySelector('.button-face');
    const rect = face.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(getComputedStyle(face).transform);
    return { x: matrix.a, y: matrix.d, width: target.width, height: target.height,
      widthError: Math.abs(rect.width - face.offsetWidth / 2),
      heightError: Math.abs(rect.height - face.offsetHeight / 2) };
  });
  expect(measured.x).toBe(.5);
  expect(measured.y).toBe(.5);
  expect(measured.width).toBeGreaterThanOrEqual(56);
  expect(measured.height).toBeGreaterThanOrEqual(56);
  expect(measured.widthError).toBeLessThanOrEqual(.26);
  expect(measured.heightError).toBeLessThanOrEqual(.26);
}

async function expectMapping(page, step, ready = false) {
  const stage = page.getByTestId('stage');
  const expected = {
    'filling-hd.png': [4, 5].includes(step),
    'timer-frame-hd.png': step === 8,
    'lid-hd.png': step === 6 || step === 9,
    'dough-hd.png': step === 3,
    'empty-spoon-hd.png': step === 4,
    'spoon-hd.png': step === 4,
    'flour-cup-empty-hd.png': step === 1,
    'flour-particles-hd.png': step === 1,
    'bowl-empty-hd.png': step === 1,
    'jug-hd.png': step === 2,
    'jug-empty-hd.png': step === 2,
    'wrapper-hd.png': [4, 5].includes(step),
    'cover-basket-hd.png': step === 0,
  };
  for (const [name, present] of Object.entries(expected)) {
    const image = stage.locator(`img[src$="/${name}"]`);
    await expect(image).toHaveCount(present ? 1 : 0);
    if (present) await expect.poll(() => image.evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual(supplied[name].size);
  }
  await expect(stage.locator('img[src$="/steam-puff-hd.png"]')).toHaveCount(0);
  const steam = stage.locator('img[src$="/steam-single-hd.png"]');
  await expect(steam).toHaveCount(step === 7 ? 10 : 0);
  if (step === 7) {
    await expect.poll(() => steam.first().evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual(supplied['steam-single-hd.png'].size);
    const sequence = stage.getByTestId('steaming-sequence');
    await expect(sequence).toHaveCount(1);
    for (const name of ['stove-hd', 'flame-hd', 'steamer-open-hd', 'wrap-3-hd', 'lid-hd']) {
      await expect(sequence.locator(`image[href$="/${name}.png"]`).first()).toHaveCount(1);
    }
    for (const name of ['stove', 'flame', 'basket', 'bun', 'lid']) {
      await expect(sequence.getByTestId(`steam-${name}`)).toHaveCSS('opacity', ready || name === 'stove' ? '1' : '0');
    }
    const envelopes = sequence.getByTestId('steam-wisp');
    await expect(envelopes).toHaveCount(10);
    for (let index = 0; index < 10; index += 1) await expect(envelopes.nth(index)).toHaveCSS('opacity', ready ? '1' : '0');
    await expect(stage.locator('img[src$="/finished.png"]')).toHaveCount(0);
  }
  if (step === 1) {
    await expect(stage.locator('img[src$="/flour-cup-hd.png"]')).toHaveCSS('opacity', ready ? '0' : '1');
    await expect(stage.locator('img[src$="/flour-cup-empty-hd.png"]')).toHaveCSS('opacity', ready ? '1' : '0');
    await expect(stage.locator('img[src$="/bowl-empty-hd.png"]')).toHaveCSS('opacity', ready ? '0' : '1');
    await expect(stage.locator('img[src$="/bowl-hd.png"]')).toHaveCSS('opacity', ready ? '1' : '0');
    await expect(stage.locator('img[src$="/flour-particles-hd.png"]')).toHaveCSS('opacity', '0');
  }
  const drops = stage.locator('img[src$="/water-drop-hd.png"]');
  await expect(drops).toHaveCount(step === 2 && ready ? 4 : 0);
  await expect(stage.locator('[src$="/water-drops-hd.png"], [href$="/water-drops-hd.png"]')).toHaveCount(0);
  if (step === 2) {
    await expect(stage.locator('img[src$="/jug-hd.png"]')).toHaveCSS('opacity', ready ? '0' : '1');
    await expect(stage.locator('img[src$="/jug-empty-hd.png"]')).toHaveCSS('opacity', ready ? '1' : '0');
    if (ready) {
      await expect.poll(() => drops.first().evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual(supplied['water-drop-hd.png'].size);
      for (let i = 0; i < 4; i += 1) await expect(drops.nth(i)).toHaveCSS('opacity', '0');
    }
  }
  if (step === 4) {
    await expect(stage.locator('img[src$="/spoon-hd.png"]')).toHaveCSS('opacity', ready ? '0' : '1');
    await expect(stage.locator('img[src$="/empty-spoon-hd.png"]')).toHaveCSS('opacity', ready ? '1' : '0');
    await expect(stage.locator('img[src$="/filling-hd.png"]')).toHaveCSS('opacity', ready ? '1' : '0');
  }
  for (let fold = 1; fold <= 3; fold += 1) {
    const wrap = stage.locator(`img[src$="/wrap-${fold}-hd.png"]`);
    await expect(wrap).toHaveCount(step === 5 ? 1 : 0);
    if (step === 5) await expect(wrap).toHaveCSS('opacity', ready && fold === 3 ? '1' : '0');
  }
  if (step === 5) {
    await expect(stage.locator('img[src$="/bun-hd.png"]')).toHaveCount(0);
    await expect(stage.locator('.wrapping-base')).toHaveCSS('opacity', ready ? '0' : '1');
  }
  const open = stage.getByTestId('open-steamer-hd');
  await expect(open).toHaveCount(step === 6 ? 1 : 0);
  if (step === 6) {
    await expect(open.locator('svg image[href$="/assets/steamer-open-hd.png"]')).toHaveCount(2);
    await expect(open.locator('img[src$="/assets/bun-hd.png"]')).toHaveCount(1);
    expect(await open.evaluate((element) => [...element.children].map((child) => child.tagName.toLowerCase()))).toEqual(['svg', 'img', 'svg']);
  }
  const closed = stage.locator('svg[data-testid="closed-steamer-hd"]');
  await expect(closed).toHaveCount(step === 9 ? 1 : 0);
  if (step === 9) {
    const hrefs = await closed.locator('image').evaluateAll((images) => images.map((image) => image.getAttribute('href') || image.getAttribute('xlink:href')));
    expect(hrefs.map((href) => href.split('/').at(-1)).sort()).toEqual([
      'flame-hd.png', 'steamer-closed-hd.png', 'stove-hd.png', 'stove-hd.png',
    ]);
    await expect(closed.locator('image[href$="/stove-hd.png"][clip-path]')).toHaveCount(2);
  }
  await expect(page.getByTestId('finished-hd')).toHaveCount(step === 9 ? 1 : 0);
}

async function observeClock(page) {
  // Only observe DOM state; the product has no jump-step or timer test hooks.
  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="game-shell"]');
    window.__transparentClock = { started: null, ready: null, digits: [] };
    window.__transparentEffects = { flourVisible: false, waterVisible: false, waterCount: 0 };
    const record = () => {
      if (root.dataset.phase === 'action') {
        if (root.dataset.step === '1') {
          const flour = root.querySelector('img[src$="/flour-particles-hd.png"]');
          if (flour && Number(getComputedStyle(flour).opacity) > 0) window.__transparentEffects.flourVisible = true;
        }
        if (root.dataset.step === '2') {
          const drops = [...root.querySelectorAll('img[src$="/water-drop-hd.png"]')];
          if (drops.length === 4 && drops.every((drop) => Number(getComputedStyle(drop).opacity) > 0)) {
            window.__transparentEffects.waterVisible = true;
            window.__transparentEffects.waterCount = drops.length;
          }
        }
      }
      if (root.dataset.step !== '8') return;
      const result = window.__transparentClock;
      const digit = document.querySelector('[data-testid="countdown"]')?.textContent?.trim();
      if (digit && digit !== result.digits.at(-1)) result.digits.push(digit);
      if (root.dataset.phase === 'countdown' && result.started === null) result.started = performance.now();
      if (root.dataset.phase === 'ready' && result.ready === null) result.ready = performance.now();
    };
    new MutationObserver(record).observe(root, {
      attributes: true, attributeFilter: ['data-step', 'data-phase', 'style'],
      subtree: true, childList: true, characterData: true,
    });
    record();
  });
}

async function expectClearCenteredClock(page) {
  const timer = page.locator('.timer.timer-hd');
  await expect(timer).toBeVisible();
  await expect(timer).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('countdown')).toBeVisible();
  const geometry = await timer.evaluate((element) => {
    const digit = element.querySelector('[data-testid="countdown"]');
    const ring = element.querySelector('.ring-track');
    const a = digit.getBoundingClientRect();
    // The new frame includes ears: the dial's center is the native SVG circle
    // (609, 680), not the midpoint of the whole 1218 × 1292 canvas.
    const center = new DOMPoint(ring.cx.baseVal.value, ring.cy.baseVal.value).matrixTransform(ring.getScreenCTM());
    const timerBox = element.getBoundingClientRect();
    const stage = element.closest('[data-testid="stage"]').getBoundingClientRect();
    const x = a.x + a.width / 2;
    const y = a.y + a.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      centerXError: Math.abs(x - center.x),
      centerYError: Math.abs(y - center.y),
      centerUncovered: top === digit || digit.contains(top),
      insideStage: timerBox.x >= stage.x - 1 && timerBox.y >= stage.y - 1
        && timerBox.right <= stage.right + 1 && timerBox.bottom <= stage.bottom + 1,
    };
  });
  expect(geometry.centerXError).toBeLessThanOrEqual(1);
  expect(geometry.centerYError).toBeLessThanOrEqual(1);
  expect(geometry.centerUncovered).toBe(true);
  expect(geometry.insideStage).toBe(true);
}

async function completeJourney(page, capture) {
  await expect(shell(page)).toHaveAttribute('data-step', '0');
  await expectMapping(page, 0);
  await observeClock(page);
  await expectControl(primary(page));
  await primary(page).click();
  for (let step = 1; step <= 7; step += 1) {
    await expect(shell(page)).toHaveAttribute('data-step', String(step));
    await expect(primary(page)).toBeEnabled();
    await expectMapping(page, step);
    await expectControl(primary(page));
    if (capture && [1, 2, 3, 4, 5, 6].includes(step)) await capture(`step-${step}-idle`);
    for (let count = 0; count < ([3, 5].includes(step) ? 3 : 1); count += 1) {
      await expect(primary(page)).toBeEnabled();
      await primary(page).click();
    }
    await expect(next(page)).toBeVisible();
    await expect(shell(page)).toHaveAttribute('data-step', String(step));
    await expectMapping(page, step, true);
    if (step === 1) expect(await page.evaluate(() => window.__transparentEffects.flourVisible)).toBe(true);
    if (step === 2) expect(await page.evaluate(() => window.__transparentEffects)).toMatchObject({ waterVisible: true, waterCount: 4 });
    await expectControl(next(page));
    if (capture && [1, 2, 4, 5, 6, 7].includes(step)) await capture(`step-${step}-ready`);
    await next(page).click();
  }
  await expect(shell(page)).toHaveAttribute('data-step', '8');
  await expect(shell(page)).toHaveAttribute('data-phase', 'countdown');
  await expectMapping(page, 8);
  await expectClearCenteredClock(page);
  await expect(primary(page)).toHaveCount(0);
  if (capture) await capture('step-8-countdown');
  const elapsed = await page.evaluate(() => performance.now() - window.__transparentClock.started);
  await page.waitForTimeout(Math.max(0, 4_100 - elapsed));
  await expect(next(page)).toHaveCount(0);
  await expect(next(page)).toBeVisible({ timeout: 2_500 });
  const clock = await page.evaluate(() => window.__transparentClock);
  expect(clock.digits).toEqual(['5', '4', '3', '2', '1']);
  expect(clock.ready - clock.started).toBeGreaterThanOrEqual(4_900);
  await page.waitForTimeout(150);
  await expect(shell(page)).toHaveAttribute('data-step', '8');
  await expectControl(next(page));
  await next(page).click();
  await expect(shell(page)).toHaveAttribute('data-step', '9');
  await expectMapping(page, 9);
  await expectControl(primary(page));
  await primary(page).click();
  await expect(shell(page)).toHaveAttribute('data-step', '0');
}

test('20 transparent assets match the supplied bytes and dimensions, while 23 existing PNGs remain unchanged', async () => {
  for (const [name, { hash, size }] of Object.entries(supplied)) {
    const png = await readFile(new URL(name, assets));
    expect(createHash('sha256').update(png).digest('hex'), name).toBe(hash);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], name).toEqual(size);
  }
  for (const [name, hash] of Object.entries(unchanged)) {
    expect(createHash('sha256').update(await readFile(new URL(name, assets))).digest('hex'), name).toBe(hash);
  }
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 768, height: 1024 },
  { width: 1920, height: 1080 },
]) {
  test(`transparent artwork, centered clock and explicit five-second Next flow at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await completeJourney(page, (stage) => page.screenshot({
      path: testInfo.outputPath(`${stage}-${viewport.width}x${viewport.height}.png`),
    }));
  });
}

test('all 20 transparent assets are cached byte-exactly and the full journey works after an offline reload', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('cache-status')).toHaveAttribute('data-state', 'ready', { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const names = Object.keys(supplied);
  const cached = await page.evaluate(async (files) => Promise.all(files.map(async (name) => Boolean(await caches.match(new URL(`assets/${name}`, document.baseURI))))), names);
  expect(cached).toEqual(names.map(() => true));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const fetched = await page.evaluate(async (files) => Object.fromEntries(await Promise.all(files.map(async (name) => {
    const response = await fetch(new URL(`assets/${name}`, document.baseURI));
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return [name, [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')];
  }))), names);
  expect(fetched).toEqual(Object.fromEntries(Object.entries(supplied).map(([name, { hash }]) => [name, hash])));
  await completeJourney(page);
});
