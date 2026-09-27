import { test, expect } from '@playwright/test';

const repetitions = { 1: 1, 2: 1, 3: 3, 4: 1, 5: 3, 6: 1, 7: 1 };
const shell = (page) => page.getByTestId('game-shell');
const action = (page) => page.getByTestId('primary-action');
const nextAction = (page) => page.getByTestId('next-action');

async function expectStep(page, step, options = {}) {
  await expect(shell(page)).toHaveAttribute('data-step', String(step), options);
}

async function activateButton(button, method = 'pointer') {
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  if (method === 'keyboard') {
    await button.focus();
    await button.press('Enter');
  } else if (method === 'touch') {
    await button.tap();
  } else {
    await button.click();
  }
}

async function activate(page, method = 'pointer') {
  await activateButton(action(page), method);
}

async function goNext(page, currentStep, method = 'pointer') {
  await expect(nextAction(page)).toBeVisible();
  await expect(nextAction(page)).toBeEnabled();
  await expectStep(page, currentStep);
  await activateButton(nextAction(page), method);
  await expectStep(page, currentStep + 1);
}

async function reachCountdown(page, { method = 'pointer', inspect } = {}) {
  await expectStep(page, 0);
  if (inspect) await inspect(0);
  await activate(page, method);
  for (let step = 1; step <= 7; step += 1) {
    await expectStep(page, step);
    if (inspect) await inspect(step);
    for (let repetition = 0; repetition < repetitions[step]; repetition += 1) {
      await activate(page, method);
      if (repetition < repetitions[step] - 1) await expectStep(page, step);
    }
    await expect(nextAction(page)).toBeVisible();
    await expectStep(page, step);
    if (inspect) await inspect(step);
    await goNext(page, step, method);
  }
  await expectStep(page, 8);
}

async function finishCountdown(page, method = 'pointer') {
  await expect(nextAction(page)).toBeVisible({ timeout: 7_000 });
  await expectStep(page, 8);
  await expect(page.getByTestId('countdown')).not.toHaveText(/^\s*0\s*$/);
  await goNext(page, 8, method);
}

function observeErrors(page) {
  const issues = [];
  const isAsset = (url) => /\.(?:png|webp|jpe?g|svg|gif|woff2?|css|js)(?:\?|$)/i.test(url)
    && !/\/sw\.js(?:\?|$)/.test(url);
  page.on('pageerror', (error) => issues.push(`JavaScript: ${error.message}`));
  page.on('requestfailed', (request) => {
    if (isAsset(request.url())) issues.push(`Asset request: ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on('response', (response) => {
    if (isAsset(response.url()) && response.status() >= 400) {
      issues.push(`Asset HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return issues;
}

async function expectImagesLoaded(page) {
  await expect.poll(() => page.evaluate(() => [...document.images]
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.currentSrc || image.src))).toEqual([]);
}

async function expectLayoutFits(page) {
  const viewport = page.viewportSize();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(viewport.width + 2);
  expect(dimensions.height).toBeLessThanOrEqual(viewport.height + 2);
  await expect(page.getByTestId('stage')).toBeInViewport();
  const button = action(page).or(nextAction(page));
  await expect(button).toBeInViewport({ ratio: 1 });
  const box = await button.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(56);
  expect(box.height).toBeGreaterThanOrEqual(56);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function setVisibility(page, hidden) {
  // Test-only browser environment simulation; the shipped app has no test hook.
  // Real OS backgrounding is separately listed in the manual device checklist.
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => isHidden ? 'hidden' : 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('explicit Next flow, full 5→4→3→2→1 countdown, and replay reset without runtime or asset errors', async ({ page }, testInfo) => {
  const issues = observeErrors(page);
  await page.goto('/');
  await reachCountdown(page);
  await expect(page.getByTestId('countdown')).toHaveText(/^\s*5\s*$/);
  await expect(action(page)).toHaveCount(0);
  await expect(nextAction(page)).toHaveCount(0);
  const clockImages = await page.getByTestId('stage').locator('img').evaluateAll((images) => images.map((image) => ({ src: image.getAttribute('src'), alt: image.alt })));
  expect(clockImages.filter((image) => /bun|bao|dough|steamer|stove|包子|小籠包|蒸籠|爐/i.test(`${image.src} ${image.alt}`))).toEqual([]);
  await page.evaluate(() => {
    const read = () => document.querySelector('[data-testid="countdown"]')?.textContent?.trim();
    window.__observedCountdownDigits = [read()];
    window.__countdownObserver = new MutationObserver(() => {
      const digit = read();
      if (digit && digit !== window.__observedCountdownDigits.at(-1)) window.__observedCountdownDigits.push(digit);
    });
    window.__countdownObserver.observe(document.querySelector('[data-testid="stage"]'), { childList: true, subtree: true, characterData: true });
  });
  await expect(shell(page)).toHaveAttribute('data-phase', 'countdown');
  const observedStart = Date.now();
  await page.screenshot({ path: testInfo.outputPath('countdown-clock-only.png') });
  await page.waitForTimeout(Math.max(0, 4_100 - (Date.now() - observedStart)));
  await expectStep(page, 8);
  await expect(nextAction(page)).toHaveCount(0);
  await expect(nextAction(page)).toBeVisible({ timeout: 2_500 });
  // A small observation allowance covers the render-to-assertion interval.
  expect(Date.now() - observedStart).toBeGreaterThanOrEqual(4_800);
  const digits = await page.evaluate(() => {
    window.__countdownObserver.disconnect();
    return window.__observedCountdownDigits;
  });
  expect(digits).toEqual(['5', '4', '3', '2', '1']);
  await page.waitForTimeout(600);
  await expectStep(page, 8);
  await goNext(page, 8);
  await expect(page.getByText('Done!', { exact: true })).toBeVisible();
  await expect(page.getByText('做好啦！', { exact: true })).toBeVisible();
  await expectImagesLoaded(page);
  await expect(action(page)).toContainText('再做一次');
  await activate(page);
  await expectStep(page, 0);
  await expect(nextAction(page)).toHaveCount(0);
  await expect(page.getByTestId('countdown')).toHaveCount(0);
  await activate(page);
  await expectStep(page, 1);
  await expect(action(page)).toBeEnabled();
  await expect(nextAction(page)).toHaveCount(0);
  expect(issues).toEqual([]);
});

test('rapid pointer presses do not skip an ingredient or consume several kneads at once', async ({ page }) => {
  await page.goto('/');
  await activate(page);
  await expectStep(page, 1);
  await expect(action(page)).toBeEnabled();
  const flourButton = await action(page).boundingBox();
  await page.mouse.click(flourButton.x + flourButton.width / 2, flourButton.y + flourButton.height / 2, { clickCount: 6, delay: 12 });
  await expect(nextAction(page)).toBeVisible();
  await page.waitForTimeout(800);
  await expectStep(page, 1);
  await goNext(page, 1);
  await activate(page);
  await goNext(page, 2);
  await expect(action(page)).toBeEnabled();
  const kneadButton = await action(page).boundingBox();
  await page.mouse.click(kneadButton.x + kneadButton.width / 2, kneadButton.y + kneadButton.height / 2, { clickCount: 6, delay: 12 });
  await page.waitForTimeout(800);
  await expectStep(page, 3);
  await expect(nextAction(page)).toHaveCount(0);
  await activate(page);
  await expectStep(page, 3);
  await activate(page);
  await goNext(page, 3);
});

test('held Enter cannot activate the newly focused Next; repeated Space is suppressed and a fresh press works', async ({ page }) => {
  await page.goto('/');
  await activate(page);
  await expectStep(page, 1);
  await expect(action(page)).toBeEnabled();
  await action(page).focus();
  await page.keyboard.down('Enter');
  // Keep the same key physically down across the action and Next autofocus.
  // Subsequent keyboard.down calls are trusted browser events with repeat=true.
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(100);
    await page.keyboard.down('Enter');
  }
  await expectStep(page, 1);
  await expect(nextAction(page)).toBeFocused();
  await page.keyboard.up('Enter');
  await nextAction(page).press('Space');
  await expectStep(page, 2);
  await expect(action(page)).toBeEnabled();
  await action(page).focus();
  await page.evaluate(() => {
    window.__repeatedSpaceEvents = [];
    document.addEventListener('keydown', (event) => {
      if (event.key === ' ' && event.repeat) window.__repeatedSpaceEvents.push(event.defaultPrevented);
    });
  });
  await page.keyboard.down('Space');
  for (let i = 0; i < 4; i += 1) await page.keyboard.down('Space');
  expect(await page.evaluate(() => window.__repeatedSpaceEvents)).toEqual([true, true, true, true]);
  await expectStep(page, 2);
  await page.keyboard.up('Space');
  // Releasing the original press may complete one action; it must not navigate.
  await expect(nextAction(page)).toBeVisible();
  await expectStep(page, 2);
  await goNext(page, 2, 'keyboard');
});

test('a real horizontal kneading swipe counts once and the immediately following tap is not swallowed', async ({ page }) => {
  await page.goto('/');
  await activate(page);
  await activate(page);
  await goNext(page, 1);
  await activate(page);
  await goNext(page, 2);
  const hitArea = page.locator('.art-hit-area.hit-3');
  await expect(hitArea).toBeEnabled();
  const box = await hitArea.boundingBox();
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .75, box.y + box.height * .5, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.repetition-count')).toHaveAttribute('aria-label', '已完成 1 次，共 3 次');
  await expect(hitArea).toBeEnabled();
  await hitArea.click();
  await expect(page.locator('.repetition-count')).toHaveAttribute('aria-label', '已完成 2 次，共 3 次');
  await expect(hitArea).toBeEnabled();
  await hitArea.click();
  await expect(nextAction(page)).toBeVisible();
  await expectStep(page, 3);
  await goNext(page, 3);
});

test('countdown pauses for hidden documents and the home confirmation, then resumes; home confirmation resets', async ({ page }) => {
  await page.goto('/');
  await reachCountdown(page);
  await expect(shell(page)).toHaveAttribute('data-phase', 'countdown');
  await setVisibility(page, true);
  const hiddenValue = await page.getByTestId('countdown').innerText();
  await page.waitForTimeout(5_300);
  await expectStep(page, 8);
  await expect(page.getByTestId('countdown')).toHaveText(hiddenValue);
  await expect(nextAction(page)).toHaveCount(0);
  await setVisibility(page, false);
  await page.getByRole('button', { name: '回到首頁', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const pausedValue = await page.getByTestId('countdown').innerText();
  await page.waitForTimeout(5_300);
  await expectStep(page, 8);
  await expect(page.getByTestId('countdown')).toHaveText(pausedValue);
  await expect(nextAction(page)).toHaveCount(0);
  await dialog.getByRole('button', { name: '繼續製作', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await finishCountdown(page);
  await activate(page);
  await expectStep(page, 0);
  await activate(page);
  await expectStep(page, 1);
  await page.getByRole('button', { name: '回到首頁', exact: true }).click();
  await dialog.getByRole('button', { name: '回到首頁', exact: true }).click();
  await expectStep(page, 0);
});

test('the complete game works with keyboard activation', async ({ page }) => {
  await page.goto('/');
  await reachCountdown(page, { method: 'keyboard' });
  await finishCountdown(page, 'keyboard');
  await action(page).focus();
  await action(page).press('Space');
  await expectStep(page, 0);
});

test.describe('touch emulation', () => {
  test.use({
    hasTouch: true, isMobile: true, viewport: { width: 360, height: 640 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  test('the complete game works with touch taps and the timer excludes the hidden iOS install tab stop', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '加入主畫面', exact: true })).toBeVisible();
    await reachCountdown(page, { method: 'touch' });
    await expect(page.getByRole('button', { name: '加入主畫面', exact: true, includeHidden: true })).not.toBeVisible();
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('footer')))).toBe(false);
    }
    await finishCountdown(page, 'touch');
    await activate(page, 'touch');
    await expectStep(page, 0);
  });
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 768, height: 1024 },
  { width: 1920, height: 1080 },
  { width: 844, height: 390 },
]) {
  test(`all playable stages fit ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await reachCountdown(page, { inspect: () => expectLayoutFits(page) });
    await expect(nextAction(page)).toBeVisible({ timeout: 7_000 });
    await expectLayoutFits(page);
    await finishCountdown(page);
    await expectLayoutFits(page);
    await expectImagesLoaded(page);
    await page.screenshot({ path: testInfo.outputPath(`finished-${viewport.width}x${viewport.height}.png`) });
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('reduced motion retains every game action and the countdown', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await reachCountdown(page);
    await expect(page.getByTestId('countdown')).toHaveText(/^\s*5\s*$/);
    await expect(shell(page)).toHaveAttribute('data-phase', 'countdown');
    const observedStart = Date.now();
    await expect(nextAction(page)).toBeVisible({ timeout: 6_000 });
    expect(Date.now() - observedStart).toBeGreaterThanOrEqual(4_800);
    await finishCountdown(page);
  });
});

test('production manifest provides standalone launch and correctly sized install icons', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) throw new Error('No web app manifest link');
    const response = await fetch(link.href);
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    return response.json();
  });
  expect(manifest.name).toBeTruthy();
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((icon) => icon.sizes.split(' ').includes('192x192'))).toBe(true);
  expect(manifest.icons.some((icon) => icon.sizes.split(' ').includes('512x512'))).toBe(true);
  expect(manifest.icons.some((icon) => icon.purpose?.split(' ').includes('maskable'))).toBe(true);
});

test('after complete precache the game reloads, navigates, and completes offline', async ({ page, context }) => {
  const issues = observeErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('cache-status')).toHaveAttribute('data-state', 'ready', { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectStep(page, 0);
  await page.goto('/?offline-acceptance=1', { waitUntil: 'domcontentloaded' });
  await expectStep(page, 0);
  await expect(page.getByTestId('cache-status')).toHaveAttribute('data-state', 'ready');
  await reachCountdown(page);
  await finishCountdown(page);
  await expectImagesLoaded(page);
  expect(issues).toEqual([]);
});

test('standalone code-path emulation remains playable (not proof of an OS install)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /安裝/ })).toHaveCount(0);
  await reachCountdown(page);
  await finishCountdown(page);
});
