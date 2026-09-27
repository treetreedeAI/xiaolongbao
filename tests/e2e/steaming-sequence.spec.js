import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// Only step 7 is under test. Earlier steps are reached through their normal UI.
const sourceAssets = {
  'stove-hd.png': { size: [1774, 887], hash: '96a47035de56e3710e59cb3f28be1519dcb23c11cce35971c88f2864fe112e99' },
  'flame-hd.png': { size: [1774, 887], hash: '3afe6fbdd18be97b9513f48b31307a271900cea8a1b976580a160ea841efd377' },
  'steamer-open-hd.png': { size: [1459, 1078], hash: 'a21fe21298bd6c1e7e7c3288a55a187bd63a83fc30b12487d4fc48c80b7f26e6' },
  'wrap-3-hd.png': { size: [1402, 1122], hash: 'de50fe3f4c943359f7487c7ddcdc76bf5b19423789c60e969fc1af2cab75aeca' },
  'lid-hd.png': { size: [1536, 1024], hash: 'b2765c4d5d822409bbf3de67782c20ccc2d0f06b55c9870131099c3c4ae06f14' },
  'steam-single-hd.png': { size: [1024, 1536], hash: '39f551d933d16843e17200f4e08dba5d3170060d9a5265ec4a863d0e804166ca' },
};
const layerIds = ['steam-stove', 'steam-flame', 'steam-basket', 'steam-bun', 'steam-lid'];
const shell = (page) => page.getByTestId('game-shell');
const primary = (page) => page.getByTestId('primary-action');
const next = (page) => page.getByTestId('next-action');
const sequence = (page) => page.getByTestId('steaming-sequence');

test.use({ reducedMotion: 'reduce' });

async function reachStepSeven(page, { reducedMotion = false } = {}) {
  await expect(shell(page)).toHaveAttribute('data-step', '0');
  await primary(page).click();
  for (let step = 1; step <= 6; step += 1) {
    await expect(shell(page)).toHaveAttribute('data-step', String(step));
    for (let count = 0; count < ([3, 5].includes(step) ? 3 : 1); count += 1) {
      await expect(primary(page)).toBeEnabled();
      await primary(page).click();
    }
    await expect(next(page)).toBeEnabled();
    if (step === 6) {
      await expect(sequence(page)).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    }
    await next(page).click();
  }
  await expect(shell(page)).toHaveAttribute('data-step', '7');
  await expect(primary(page)).toBeEnabled();
  await expect(sequence(page)).toBeVisible();
}

async function readLayers(page) {
  return sequence(page).evaluate((element, ids) => {
    const opacity = (node) => Number(getComputedStyle(node).opacity);
    return {
      layers: ids.map((id) => opacity(element.querySelector(`[data-testid="${id}"]`))),
      plumes: [...element.querySelectorAll('img[src$="/steam-single-hd.png"]')].map((image) => {
        const box = image.getBoundingClientRect();
        // Ancestor opacity matters when a plume is animated by its container.
        let visibleOpacity = opacity(image);
        for (let parent = image.parentElement; parent && parent !== element; parent = parent.parentElement) visibleOpacity *= opacity(parent);
        const envelope = image.closest('[data-testid="steam-wisp"]');
        const transform = new DOMMatrixReadOnly(getComputedStyle(envelope).transform);
        return { opacity: visibleOpacity, envelope: opacity(envelope), scale: transform.a, width: box.width, height: box.height };
      }),
    };
  }, layerIds);
}

async function expectSourceMapping(page) {
  await expect(sequence(page)).toHaveCount(1);
  for (const id of layerIds) await expect(sequence(page).getByTestId(id)).toHaveCount(1);
  const used = await sequence(page).locator('image, img').evaluateAll((images) => [...new Set(images.map((image) => (
    image.getAttribute('href') || image.getAttribute('xlink:href') || image.getAttribute('src')
  ).split('/').at(-1)))].sort());
  expect(used).toEqual(Object.keys(sourceAssets).sort());
  await expect(sequence(page).locator('img[src$="/steam-single-hd.png"]')).toHaveCount(10);
  await expect(page.getByTestId('stage').locator('[src$="/finished.png"], [href$="/finished.png"], [data-testid="closed-steamer-hd"]')).toHaveCount(0);
  const dimensions = await page.evaluate(async (names) => Object.fromEntries(await Promise.all(names.map(async (name) => {
    const image = new Image();
    image.src = new URL(`assets/${name}`, document.baseURI).href;
    await image.decode();
    return [name, [image.naturalWidth, image.naturalHeight]];
  }))), Object.keys(sourceAssets));
  expect(dimensions).toEqual(Object.fromEntries(Object.entries(sourceAssets).map(([name, { size }]) => [name, size])));
}

async function expectFits(page, control) {
  await expect(sequence(page)).toBeInViewport({ ratio: 1 });
  await expect(control).toBeInViewport({ ratio: 1 });
  const metrics = await control.evaluate((button) => {
    const target = button.getBoundingClientRect();
    const face = button.querySelector('.button-face');
    const transform = new DOMMatrixReadOnly(getComputedStyle(face).transform);
    return { width: target.width, height: target.height, x: transform.a, y: transform.d };
  });
  expect(metrics.width).toBeGreaterThanOrEqual(56);
  expect(metrics.height).toBeGreaterThanOrEqual(56);
  expect(metrics.x).toBe(.5);
  expect(metrics.y).toBe(.5);
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual(page.viewportSize());
}

async function observeSequence(page) {
  await page.evaluate((ids) => {
    const root = document.querySelector('[data-testid="game-shell"]');
    const sequence = root.querySelector('[data-testid="steaming-sequence"]');
    const opacity = (element) => Number(getComputedStyle(element).opacity);
    window.__steamSequence = { started: null, ready: null, samples: [] };
    const record = () => {
      const result = window.__steamSequence;
      if (root.dataset.step !== '7') return;
      if (root.dataset.phase === 'action' && result.started === null) result.started = performance.now();
      if (root.dataset.phase === 'ready' && result.ready === null) result.ready = performance.now();
      if (result.started === null) return;
      const layers = ids.map((id) => opacity(sequence.querySelector(`[data-testid="${id}"]`)));
      const plumes = [...sequence.querySelectorAll('img[src$="/steam-single-hd.png"]')].map((image) => {
        let visibleOpacity = opacity(image);
        for (let parent = image.parentElement; parent && parent !== sequence; parent = parent.parentElement) visibleOpacity *= opacity(parent);
        const box = image.getBoundingClientRect();
        const envelope = image.closest('[data-testid="steam-wisp"]');
        return { opacity: visibleOpacity, envelope: opacity(envelope), width: box.width, height: box.height };
      });
      result.samples.push({ time: performance.now(), progress: Number(sequence.dataset.progress), phase: root.dataset.phase, layers, plumes });
    };
    new MutationObserver(record).observe(root, {
      attributes: true, attributeFilter: ['data-phase', 'data-progress', 'style', 'opacity', 'transform'],
      subtree: true, childList: true,
    });
  }, layerIds);
}

async function expectIdle(page) {
  await expectSourceMapping(page);
  await expect(shell(page)).toHaveAttribute('data-phase', 'idle');
  const state = await readLayers(page);
  expect(state.layers).toEqual([1, 0, 0, 0, 0]);
  expect(state.plumes.map((plume) => plume.envelope)).toEqual(Array(10).fill(0));
  expect(state.plumes.map((plume) => plume.scale)).toEqual(Array(10).fill(1));
  await expect(next(page)).toHaveCount(0);
  await expectFits(page, primary(page));
  return state;
}

async function expectReady(page, initial) {
  await expect(shell(page)).toHaveAttribute('data-phase', 'ready');
  await expect(shell(page)).toHaveAttribute('data-step', '7');
  const state = await readLayers(page);
  expect(state.layers).toEqual([1, 1, 1, 1, 1]);
  expect(state.plumes.map((plume) => plume.envelope)).toEqual(Array(10).fill(1));
  expect(state.plumes.map((plume) => plume.scale)).toEqual(Array(10).fill(1.5));
  for (const [index, plume] of state.plumes.entries()) {
    expect(plume.opacity).toBeGreaterThanOrEqual(.49);
    expect(plume.width / initial.plumes[index].width).toBeCloseTo(1.5, 4);
    expect(plume.height / initial.plumes[index].height).toBeCloseTo(1.5, 4);
  }
  await expect(primary(page)).toHaveCount(0);
  await expectFits(page, next(page));
  // The bun remains rendered; front basket and lid overlap it in paint order.
  const order = await sequence(page).locator('svg > g[data-testid]').evaluateAll((groups) => groups.map((group) => group.dataset.testid));
  expect(order.indexOf('steam-basket-front')).toBeGreaterThan(order.indexOf('steam-bun'));
  expect(order.indexOf('steam-lid')).toBeGreaterThan(order.indexOf('steam-basket-front'));
}

async function expectSequenceOrder(page) {
  const result = await page.evaluate(() => window.__steamSequence);
  expect(result.ready - result.started).toBeGreaterThanOrEqual(5_100);
  const samples = result.samples.filter((sample) => sample.phase === 'action');
  const firstAppearance = layerIds.map((_, index) => samples.findIndex((sample) => sample.layers[index] > .01));
  firstAppearance.push(samples.findIndex((sample) => sample.plumes.some((plume) => plume.envelope > .01)));
  expect(firstAppearance.every((index) => index >= 0)).toBe(true);
  for (let index = 1; index < firstAppearance.length; index += 1) expect(firstAppearance[index]).toBeGreaterThan(firstAppearance[index - 1]);
  const cue = (progress, start, end) => {
    const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  for (const sample of samples) {
    const expected = [1, cue(sample.progress, .08, .23), cue(sample.progress, .24, .40), cue(sample.progress, .43, .61), cue(sample.progress, .63, .81)];
    sample.layers.forEach((opacity, index) => expect(opacity).toBeCloseTo(expected[index], 5));
    sample.plumes.forEach((plume, index) => {
      const start = index < 5 ? .81 + index * .008 : .9 + (index - 5) * .008;
      expect(plume.envelope).toBeCloseTo(cue(sample.progress, start, start + .065), 5);
    });
  }
  const firstFive = samples.find((sample) => sample.plumes.slice(0, 5).every((plume) => plume.envelope > 0) && sample.plumes.slice(5).every((plume) => plume.envelope === 0));
  expect(firstFive).toBeTruthy();
}

async function clickNextManually(page) {
  await page.waitForTimeout(150);
  await expect(shell(page)).toHaveAttribute('data-step', '7');
  await next(page).click();
  await expect(shell(page)).toHaveAttribute('data-step', '8');
  await expect(sequence(page)).toHaveCount(0);
}

test('step 7 uses the six supplied PNG files without changing their bytes or dimensions', async () => {
  for (const [name, { hash, size }] of Object.entries(sourceAssets)) {
    const png = await readFile(new URL(`../../public/assets/${name}`, import.meta.url));
    expect(createHash('sha256').update(png).digest('hex'), name).toBe(hash);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], name).toEqual(size);
  }
});

// Tablet is first so its intermediate bun placement and ready shot are available
// early for visual review. Each test owns a fresh browser context.
for (const viewport of [{ width: 768, height: 1024 }, { width: 360, height: 640 }, { width: 1920, height: 1080 }]) {
  test(`step 7 ordered assembly and growing steam fit ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await reachStepSeven(page);
    const initial = await expectIdle(page);
    await page.screenshot({ path: testInfo.outputPath(`step-7-stove-${viewport.width}x${viewport.height}.png`) });
    await observeSequence(page);
    await primary(page).click();
    await expect(primary(page)).toBeDisabled();
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="steaming-sequence"]').dataset.progress) >= .60);
    await expect(next(page)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`step-7-bun-before-lid-${viewport.width}x${viewport.height}.png`) });
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="steaming-sequence"]').dataset.progress) >= .95);
    await expect(next(page)).toHaveCount(0);
    await expect(next(page)).toBeVisible();
    await expectReady(page, initial);
    await expectSequenceOrder(page);
    await page.screenshot({ path: testInfo.outputPath(`step-7-ready-${viewport.width}x${viewport.height}.png`) });
    await clickNextManually(page);
  });
}

test('step 7 ignores rapid clicks and pauses its sequence while the home confirmation is open', async ({ page }) => {
  await page.goto('/');
  await reachStepSeven(page);
  const initial = await expectIdle(page);
  const button = await primary(page).boundingBox();
  await observeSequence(page);
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2, { clickCount: 8, delay: 0 });
  await expect(primary(page)).toBeDisabled();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="steaming-sequence"]').dataset.progress) >= .30);
  await page.getByRole('button', { name: '回到首頁', exact: true }).click();
  await expect(page.locator('dialog')).toBeVisible();
  const pausedProgress = await sequence(page).getAttribute('data-progress');
  const pausedLayers = (await readLayers(page)).layers;
  await page.waitForTimeout(800);
  expect(await sequence(page).getAttribute('data-progress')).toBe(pausedProgress);
  expect((await readLayers(page)).layers).toEqual(pausedLayers);
  await expect(next(page)).toHaveCount(0);
  await page.getByRole('button', { name: '繼續製作', exact: true }).click();
  await expect(next(page)).toBeVisible();
  await expectReady(page, initial);
  await expectSequenceOrder(page);
  await clickNextManually(page);
});

test('step 7 keeps the complete assembly and all ten steam wisps with reduced motion', async ({ page }) => {
  await page.goto('/');
  await reachStepSeven(page, { reducedMotion: true });
  const initial = await expectIdle(page);
  await observeSequence(page);
  await primary(page).click();
  await expect(next(page)).toBeVisible();
  await expectReady(page, initial);
  const observation = await page.evaluate(() => window.__steamSequence);
  expect(observation.ready - observation.started).toBeGreaterThanOrEqual(250);
  expect(observation.ready - observation.started).toBeLessThan(1_500);
  await clickNextManually(page);
});

test('step 7 assets remain byte-exactly available after an offline reload and the sequence still completes', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('cache-status')).toHaveAttribute('data-state', 'ready', { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const names = Object.keys(sourceAssets);
  expect(await page.evaluate(async (files) => Promise.all(files.map(async (name) => Boolean(await caches.match(new URL(`assets/${name}`, document.baseURI))))), names)).toEqual(names.map(() => true));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const hashes = await page.evaluate(async (files) => Object.fromEntries(await Promise.all(files.map(async (name) => {
    const response = await fetch(new URL(`assets/${name}`, document.baseURI));
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return [name, [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')];
  }))), names);
  expect(hashes).toEqual(Object.fromEntries(Object.entries(sourceAssets).map(([name, { hash }]) => [name, hash])));
  await reachStepSeven(page);
  const initial = await expectIdle(page);
  await observeSequence(page);
  await primary(page).click();
  await expect(next(page)).toBeVisible();
  await expectReady(page, initial);
  await expectSequenceOrder(page);
  await clickNextManually(page);
});
