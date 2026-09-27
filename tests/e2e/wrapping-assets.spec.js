import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// Pinned from the supplied originals, not inferred from the integrated files.
const supplied = {
  'wrap-1-hd.png': { size: [1254, 1254], hash: '19a51d41974cb5ac1c6687f095b3ae551087db0be0830265ccb4308ef5e8ff20' },
  'wrap-2-hd.png': { size: [1254, 1254], hash: '80c4b0bb063221fe9a80ec5e04420deda7b46dcdf8be617e674fbe63e0366240' },
  'wrap-3-hd.png': { size: [1402, 1122], hash: 'de50fe3f4c943359f7487c7ddcdc76bf5b19423789c60e969fc1af2cab75aeca' },
  'wrapper-hd.png': { size: [1536, 1024], hash: '079fe248f3fb1e175153475a3262bfdb835fcca63a3ef8afc445000b9b5909f1' },
  'cover-basket-hd.png': { size: [1366, 1151], hash: '87fbebdab0366c345ded78ad757bf574924e1f14bb600512cab64ff9aa52c493' },
};
const shell = (page) => page.getByTestId('game-shell');
const primary = (page) => page.getByTestId('primary-action');
const next = (page) => page.getByTestId('next-action');
const stage = (page) => page.getByTestId('stage');
const wrap = (page, fold) => stage(page).locator(`img[src$="/wrap-${fold}-hd.png"]`);

test.use({ reducedMotion: 'reduce' });

async function expectWrappingAbsent(page) {
  for (let fold = 1; fold <= 3; fold += 1) await expect(wrap(page, fold)).toHaveCount(0);
}

async function expectCoverAndWrapper(page, step) {
  for (const [name, present] of [['cover-basket-hd.png', step === 0], ['wrapper-hd.png', [4, 5].includes(step)]]) {
    const image = stage(page).locator(`img[src$="/${name}"]`);
    await expect(image).toHaveCount(present ? 1 : 0);
    if (present) {
      await expect.poll(() => image.evaluate((element) => [element.naturalWidth, element.naturalHeight])).toEqual(supplied[name].size);
      await expect(image).toBeInViewport({ ratio: 1 });
    }
  }
  await expect(stage(page).locator('img[src$="/wrapper.png"], img[src$="/cover-basket.png"]')).toHaveCount(0);
}

async function reachWrapping(page, capture) {
  await expect(shell(page)).toHaveAttribute('data-step', '0');
  await expectWrappingAbsent(page);
  await expectCoverAndWrapper(page, 0);
  if (capture) await capture('step-0-new-cover');
  await primary(page).click();
  for (let step = 1; step <= 4; step += 1) {
    await expect(shell(page)).toHaveAttribute('data-step', String(step));
    await expectWrappingAbsent(page);
    await expectCoverAndWrapper(page, step);
    if (step === 4 && capture) await capture('step-4-new-wrapper');
    for (let count = 0; count < (step === 3 ? 3 : 1); count += 1) {
      await expect(primary(page)).toBeEnabled();
      await primary(page).click();
    }
    await expect(next(page)).toBeVisible();
    await next(page).click();
  }
  await expect(shell(page)).toHaveAttribute('data-step', '5');
  await expect(primary(page)).toBeEnabled();
  await expectCoverAndWrapper(page, 5);
}

async function expectControl(button) {
  await expect(button).toBeInViewport({ ratio: 1 });
  const metrics = await button.evaluate((element) => {
    const face = element.querySelector('.button-face');
    const matrix = new DOMMatrixReadOnly(getComputedStyle(face).transform);
    const target = element.getBoundingClientRect();
    const visual = face.getBoundingClientRect();
    return { x: matrix.a, y: matrix.d, width: target.width, height: target.height,
      widthError: Math.abs(visual.width - face.offsetWidth / 2),
      heightError: Math.abs(visual.height - face.offsetHeight / 2) };
  });
  expect(metrics.x).toBe(.5);
  expect(metrics.y).toBe(.5);
  expect(metrics.width).toBeGreaterThanOrEqual(56);
  expect(metrics.height).toBeGreaterThanOrEqual(56);
  expect(metrics.widthError).toBeLessThanOrEqual(.26);
  expect(metrics.heightError).toBeLessThanOrEqual(.26);
}

async function expectStableFold(page, count) {
  await expect(shell(page)).toHaveAttribute('data-step', '5');
  await expect(shell(page)).toHaveAttribute('data-phase', count === 3 ? 'ready' : 'idle');
  await expect(stage(page).locator('.wrapping-base')).toHaveCSS('opacity', count === 0 ? '1' : '0');
  await expect(stage(page).locator('.wrapping-base img[src$="/wrapper-hd.png"]')).toHaveCount(1);
  await expect(stage(page).locator('.wrapping-base img[src$="/filling-hd.png"]')).toHaveCount(1);
  await expect(stage(page).locator('img[src$="/bun-hd.png"]')).toHaveCount(0);
  for (let fold = 1; fold <= 3; fold += 1) {
    const image = wrap(page, fold);
    await expect(image).toHaveCount(1);
    await expect(image).toHaveCSS('opacity', fold === count ? '1' : '0');
    await expect.poll(() => image.evaluate((element) => [element.naturalWidth, element.naturalHeight])).toEqual(supplied[`wrap-${fold}-hd.png`].size);
    await expect(image).toBeInViewport({ ratio: 1 });
    const contained = await image.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const parent = element.closest('[data-testid="stage"]').getBoundingClientRect();
      return box.x >= parent.x - 1 && box.y >= parent.y - 1
        && box.right <= parent.right + 1 && box.bottom <= parent.bottom + 1;
    });
    expect(contained).toBe(true);
  }
  if (count < 3) {
    await expect(primary(page)).toBeEnabled();
    await expect(next(page)).toHaveCount(0);
    await expect(page.locator('.repetition-count')).toHaveAttribute('aria-label', `已完成 ${count} 次，共 3 次`);
    await expectControl(primary(page));
  } else {
    await expect(next(page)).toBeEnabled();
    await expect(primary(page)).toHaveCount(0);
    await expectControl(next(page));
  }
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual(page.viewportSize());
}

async function observeCrossfade(page) {
  // Read-only observation of rendered opacity; no production step-jump hooks.
  await page.evaluate(() => {
    window.__wrappingObserver?.disconnect();
    window.__wrappingSamples = [];
    const root = document.querySelector('[data-testid="game-shell"]');
    const record = () => {
      if (root.dataset.step !== '5' || root.dataset.phase !== 'action') return;
      const nodes = [root.querySelector('.wrapping-base'), ...[1, 2, 3].map((fold) => root.querySelector(`img[src$="/wrap-${fold}-hd.png"]`))];
      window.__wrappingSamples.push(nodes.map((element) => Number(getComputedStyle(element).opacity)));
    };
    window.__wrappingObserver = new MutationObserver(record);
    window.__wrappingObserver.observe(root, { attributes: true, attributeFilter: ['style', 'data-phase'], subtree: true });
  });
}

async function wrapThreeTimes(page, capture, { rapid = false } = {}) {
  await expectStableFold(page, 0);
  if (capture) await capture('step-5-count-0');
  for (let count = 1; count <= 3; count += 1) {
    await observeCrossfade(page);
    if (rapid) {
      const button = await primary(page).boundingBox();
      // Eight real pointer clicks in one short burst must remain one action.
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2, { clickCount: 8, delay: 0 });
    } else {
      await primary(page).click();
    }
    await expectStableFold(page, count);
    const samples = await page.evaluate(() => window.__wrappingSamples);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.some((weights) => weights[count - 1] > 0 && weights[count] > 0)).toBe(true);
    for (const weights of samples) {
      expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 5);
      weights.forEach((weight, index) => {
        if (index !== count - 1 && index !== count) expect(weight).toBe(0);
      });
    }
    if (capture) await capture(`step-5-count-${count}`);
  }
  // Completing a third fold does not automatically move to step 6.
  await page.waitForTimeout(150);
  await expectStableFold(page, 3);
  await next(page).click();
  await expect(shell(page)).toHaveAttribute('data-step', '6');
  await expect(primary(page)).toBeEnabled();
  await expectWrappingAbsent(page);
  await expectCoverAndWrapper(page, 6);
  const bun = stage(page).getByTestId('open-steamer-hd').locator('img[src$="/bun-hd.png"]');
  await expect(bun).toHaveCount(1);
  await expect.poll(() => bun.evaluate((element) => [element.naturalWidth, element.naturalHeight])).toEqual([1403, 1121]);
  await expectControl(primary(page));
  if (capture) await capture('step-6-unchanged-bun');
}

test('three wrapping PNGs plus cover and wrapper are byte-identical and step 6 bun bytes are unchanged', async () => {
  const assets = new URL('../../public/assets/', import.meta.url);
  for (const [name, { hash, size }] of Object.entries(supplied)) {
    const png = await readFile(new URL(name, assets));
    expect(createHash('sha256').update(png).digest('hex'), name).toBe(hash);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], name).toEqual(size);
  }
  expect(createHash('sha256').update(await readFile(new URL('bun-hd.png', assets))).digest('hex')).toBe('272ba195058f4d56cda1646845492d352f901077238683553d9da6b2f0928448');
});

for (const viewport of [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1920, height: 1080 }]) {
  test(`three ordered wrapping crossfades resist rapid clicks and fit ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const capture = (name) => page.screenshot({ path: testInfo.outputPath(`${name}-${viewport.width}x${viewport.height}.png`) });
    await reachWrapping(page, capture);
    // Exercise real-duration crossfades and click locking, after quick setup.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await wrapThreeTimes(page, capture, { rapid: true });
  });
}

test('all five exact wrapping, cover and wrapper PNGs are cached and three folds work after an offline reload', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('cache-status')).toHaveAttribute('data-state', 'ready', { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const names = Object.keys(supplied);
  expect(await page.evaluate(async (files) => Promise.all(files.map(async (name) => Boolean(await caches.match(new URL(`assets/${name}`, document.baseURI))))), names)).toEqual(names.map(() => true));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const fetched = await page.evaluate(async (files) => Object.fromEntries(await Promise.all(files.map(async (name) => {
    const response = await fetch(new URL(`assets/${name}`, document.baseURI));
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return [name, [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')];
  }))), names);
  expect(fetched).toEqual(Object.fromEntries(Object.entries(supplied).map(([name, { hash }]) => [name, hash])));
  await reachWrapping(page);
  await wrapThreeTimes(page);
});
