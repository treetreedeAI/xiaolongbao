import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// Pinned directly from the user-supplied PNG files before integration.
// No dependency on a particular developer's Downloads directory at test time.
const suppliedPngSha256 = 'b2fba8de7595b0222700096192d786c8911257d5a18c86d392b767cf037cca51';
const suppliedAssets = {
  'finished-hd.png': { sha256: suppliedPngSha256, size: [1356, 1159], steps: [9] },
  'flour-cup-hd.png': { sha256: '6fea33c941d4d0187968d23200ca67738f1ccaca30b0838817a383c334488cf7', size: [1402, 1122], steps: [1] },
  'bowl-hd.png': { sha256: '3f86210f28dc6e92dfcd790d8ce93776ba385802d4352f6afb223440d4e076fe', size: [1536, 1024], steps: [1, 2] },
  'bun-hd.png': { sha256: '272ba195058f4d56cda1646845492d352f901077238683553d9da6b2f0928448', size: [1403, 1121], steps: [6] },
  'wrap-1-hd.png': { sha256: '19a51d41974cb5ac1c6687f095b3ae551087db0be0830265ccb4308ef5e8ff20', size: [1254, 1254], steps: [5] },
  'wrap-2-hd.png': { sha256: '80c4b0bb063221fe9a80ec5e04420deda7b46dcdf8be617e674fbe63e0366240', size: [1254, 1254], steps: [5] },
  'wrap-3-hd.png': { sha256: 'de50fe3f4c943359f7487c7ddcdc76bf5b19423789c60e969fc1af2cab75aeca', size: [1402, 1122], steps: [5, 7] },
  'wrapper-hd.png': { sha256: '079fe248f3fb1e175153475a3262bfdb835fcca63a3ef8afc445000b9b5909f1', size: [1536, 1024], steps: [4, 5] },
  'cover-basket-hd.png': { sha256: '87fbebdab0366c345ded78ad757bf574924e1f14bb600512cab64ff9aa52c493', size: [1366, 1151], steps: [0] },
};
const assetDirectory = new URL('../../public/assets/', import.meta.url);
const originalSceneHashes = {
  'basket-front.png': '64f9da0dac5af689da1c9a792d64c81ba4e21a9584247f1b324f2023d36f91ba',
  'bowl.png': 'e1560ed0a5b69bafb1771a2535ff324761a924eea698cc8dde8e05716a9d42dc',
  'bun.png': '5941a23e3b0f9b83f4f37bec6ef0e987b2cc5275b6fd353df7e6216a82d08da7',
  'cover-basket.png': 'b72ff662d14262437547242076219bb150b336f9e9d4ca20df028ef26871f7a8',
  'dough.png': '2b8ddfe75132e5b1fa35747d6b092b637da86981bd35b1e95bc1adcd53e7494f',
  'empty-spoon.png': '1a9d089f77a096feecc1a4b53ee618ad3174ef795952cbefa3490a4e428004c1',
  'filling.png': '347e2ea9596c687217eef839386cbb9b4c505c048e05e2096714f5c14c02ea1a',
  'finished-base.png': 'c430e7e76a258dd865a2394ce2b45b9bb77647e9bd1845dccc1ce1283ae57653',
  'finished-bun.png': '8d1b0813ca96a288f13ebf45839d832f4fab0a6656d5005c636984d7c694f8f4',
  'finished.png': 'b8ba54e5737e74bf37a51cfef5af11ee870d8e0dbbf92bffff0175db2156a0ce',
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

async function expectHdMapping(page, step) {
  const stage = page.getByTestId('stage');
  for (const [name, { size, steps }] of Object.entries(suppliedAssets)) {
    if (name === 'finished-hd.png') continue; // The final SVG has its own check.
    if (name === 'wrap-3-hd.png' && step === 7) {
      await expect(stage.locator('img[src$="/wrap-3-hd.png"]')).toHaveCount(0);
      const image = stage.getByTestId('steaming-sequence').getByTestId('steam-bun').locator('image[href$="/wrap-3-hd.png"]');
      await expect(image).toHaveCount(1);
      expect(await image.evaluate(async (element) => {
        const bitmap = new Image();
        bitmap.src = element.getAttribute('href');
        await bitmap.decode();
        return [bitmap.naturalWidth, bitmap.naturalHeight];
      })).toEqual(size);
      continue;
    }
    const sprite = stage.locator(`img[src$="/${name}"]`);
    await expect(sprite).toHaveCount(steps.includes(step) ? 1 : 0);
    if (steps.includes(step)) {
      await expect.poll(() => sprite.evaluate((image) => [image.naturalWidth, image.naturalHeight])).toEqual(size);
    }
  }
}

async function reachDone(page, { captureStep } = {}) {
  await expect(shell(page)).toHaveAttribute('data-step', '0');
  await expect(page.getByTestId('finished-hd')).toHaveCount(0);
  await expectHdMapping(page, 0);
  await primary(page).click();
  for (let step = 1; step <= 7; step += 1) {
    await expect(shell(page)).toHaveAttribute('data-step', String(step));
    await expect(page.getByTestId('finished-hd')).toHaveCount(0);
    await expectHdMapping(page, step);
    await expect(primary(page)).toBeEnabled();
    if (captureStep && [1, 2].includes(step)) await captureStep(step, 'idle');
    if (step === 7) {
      await expect(page.getByTestId('steaming-sequence')).toHaveCount(1);
      await expect(page.getByTestId('stage').locator('[src$="/finished.png"], [href$="/finished.png"], [data-testid="closed-steamer-hd"]')).toHaveCount(0);
    }
    for (let count = 0; count < ([3, 5].includes(step) ? 3 : 1); count += 1) {
      await expect(primary(page)).toBeEnabled();
      await primary(page).click();
    }
    await expect(next(page)).toBeVisible();
    await expect(page.getByTestId('finished-hd')).toHaveCount(0);
    if (step === 5) {
      await expect(page.locator('.wrapping-base')).toHaveCSS('opacity', '0');
      for (let fold = 1; fold <= 3; fold += 1) {
        await expect(page.getByTestId('stage').locator(`img[src$="/wrap-${fold}-hd.png"]`)).toHaveCSS('opacity', fold === 3 ? '1' : '0');
      }
      await expect(page.getByTestId('stage').locator('img[src$="/bun-hd.png"]')).toHaveCount(0);
    }
    if (captureStep && [5, 6].includes(step)) await captureStep(step, 'ready');
    await next(page).click();
  }
  await expect(shell(page)).toHaveAttribute('data-step', '8');
  await expect(page.getByTestId('finished-hd')).toHaveCount(0);
  await expectHdMapping(page, 8);
  await expect(next(page)).toBeVisible({ timeout: 7_000 });
  await expect(shell(page)).toHaveAttribute('data-step', '8');
  await next(page).click();
  await expect(shell(page)).toHaveAttribute('data-step', '9');
  await expectHdMapping(page, 9);
}

async function expectExactFinalImage(page) {
  const artwork = page.getByTestId('finished-hd');
  await expect(artwork).toBeVisible();
  expect(await artwork.evaluate((element) => element.tagName.toLowerCase())).toBe('svg');
  const hrefs = await artwork.locator('image').evaluateAll((images) => images.map((image) => (
    image.getAttribute('href') || image.getAttribute('xlink:href')
  )));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) expect(href).toMatch(/(?:^|\/)assets\/finished-hd\.png$/);
  // Check decode as well as href: a valid SVG element alone can hide a failed PNG.
  expect(await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL('assets/finished-hd.png', document.baseURI).href;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  })).toEqual([1356, 1159]);
  return artwork;
}

async function expectHalfSizeReplay(page) {
  const button = primary(page);
  await expect(button).toContainText('再做一次');
  const metrics = await button.evaluate((element) => {
    const face = element.querySelector('.button-face');
    const rect = face.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(getComputedStyle(face).transform);
    return {
      scaleX: matrix.a, scaleY: matrix.d,
      widthDifference: Math.abs(rect.width - face.offsetWidth / 2),
      heightDifference: Math.abs(rect.height - face.offsetHeight / 2),
      targetWidth: target.width, targetHeight: target.height,
    };
  });
  expect(metrics.scaleX).toBe(.5);
  expect(metrics.scaleY).toBe(.5);
  expect(metrics.widthDifference).toBeLessThanOrEqual(.26);
  expect(metrics.heightDifference).toBeLessThanOrEqual(.26);
  expect(metrics.targetWidth).toBeGreaterThanOrEqual(56);
  expect(metrics.targetHeight).toBeGreaterThanOrEqual(56);
  await expect(button).toBeInViewport({ ratio: 1 });
}

test('all nine HD PNGs are byte-identical to the supplied artwork and all 19 original scene PNGs are unchanged', async () => {
  for (const [name, { sha256, size }] of Object.entries(suppliedAssets)) {
    const added = await readFile(new URL(name, assetDirectory));
    expect(createHash('sha256').update(added).digest('hex'), name).toBe(sha256);
    expect([added.readUInt32BE(16), added.readUInt32BE(20)], name).toEqual(size);
  }
  for (const [name, expectedHash] of Object.entries(originalSceneHashes)) {
    const original = await readFile(new URL(name, assetDirectory));
    expect(createHash('sha256').update(original).digest('hex'), name).toBe(expectedHash);
  }
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 768, height: 1024 },
  { width: 1920, height: 1080 },
]) {
  test(`HD artwork maps to the assigned steps at ${viewport.width}×${viewport.height} and half-size Replay works`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await reachDone(page, {
      captureStep: (step, phase) => page.screenshot({
        path: testInfo.outputPath(`hd-step-${step}-${phase}-${viewport.width}x${viewport.height}.png`),
      }),
    });
    const artwork = await expectExactFinalImage(page);
    await expect(page.getByText('Done!', { exact: true })).toBeVisible();
    await expect(page.getByText('做好啦！', { exact: true })).toBeVisible();
    await expect(artwork).toBeInViewport({ ratio: 1 });
    const artBox = await artwork.boundingBox();
    const stageBox = await page.getByTestId('stage').boundingBox();
    expect(artBox.x).toBeGreaterThanOrEqual(stageBox.x - 1);
    expect(artBox.y).toBeGreaterThanOrEqual(stageBox.y - 1);
    expect(artBox.x + artBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
    expect(artBox.y + artBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    expect(await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }))).toEqual(viewport);
    await expectHalfSizeReplay(page);
    await page.screenshot({ path: testInfo.outputPath(`finished-hd-${viewport.width}x${viewport.height}.png`) });
    await primary(page).click();
    await expect(shell(page)).toHaveAttribute('data-step', '0');
    await expect(page.getByTestId('finished-hd')).toHaveCount(0);
    await expectHdMapping(page, 0);
  });
}

test('all nine exact HD PNGs are cached and every assigned scene works after an offline reload', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('cache-status')).toHaveAttribute('data-state', 'ready', { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const names = Object.keys(suppliedAssets);
  const cachePresence = await page.evaluate(async (files) => Object.fromEntries(await Promise.all(files.map(async (name) => [
    name, Boolean(await caches.match(new URL(`assets/${name}`, document.baseURI))),
  ]))), names);
  expect(cachePresence).toEqual(Object.fromEntries(names.map((name) => [name, true])));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const downloadedHashes = await page.evaluate(async (files) => Object.fromEntries(await Promise.all(files.map(async (name) => {
    const response = await fetch(new URL(`assets/${name}`, document.baseURI));
    if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return [name, [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')];
  }))), names);
  expect(downloadedHashes).toEqual(Object.fromEntries(Object.entries(suppliedAssets).map(([name, { sha256 }]) => [name, sha256])));
  await reachDone(page);
  await expectExactFinalImage(page);
  await expectHalfSizeReplay(page);
});
