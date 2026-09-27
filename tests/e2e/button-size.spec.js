import { test, expect } from '@playwright/test';

const shell = (page) => page.getByTestId('game-shell');
const primary = (page) => page.getByTestId('primary-action');
const next = (page) => page.getByTestId('next-action');

async function expectStep(page, step) {
  await expect(shell(page)).toHaveAttribute('data-step', String(step));
}

async function expectHalfSize(button) {
  await expect(button).toBeVisible();
  await expect(button).toHaveClass(/action-hit-area/);
  await expect(button.locator('> .primary-button.button-face')).toHaveCount(1);
  // Wait for Next's arrival animation to finish before measuring its face.
  // offsetWidth/Height round layout dimensions to integers, so allow the
  // resulting <= .25 CSS px rounding in the half-size rectangle comparison.
  await expect.poll(() => button.evaluate((element) => {
    const face = element.querySelector(':scope > .button-face');
    const rect = face.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(getComputedStyle(face).transform);
    return {
      scaleX: matrix.a,
      scaleY: matrix.d,
      halfWidth: Math.abs(rect.width - face.offsetWidth / 2) <= .26,
      halfHeight: Math.abs(rect.height - face.offsetHeight / 2) <= .26,
    };
  })).toEqual({ scaleX: .5, scaleY: .5, halfWidth: true, halfHeight: true });
  const target = await button.boundingBox();
  expect(target.width).toBeGreaterThanOrEqual(56);
  expect(target.height).toBeGreaterThanOrEqual(56);
  expect(await button.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(button).toBeInViewport({ ratio: 1 });
}

async function expectNormalSize(button, expectedSize) {
  await expect(button).toBeVisible();
  await expect(button.locator('.button-face')).toHaveCount(0);
  const size = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return {
      width: rect.width, height: rect.height,
      layoutWidth: element.offsetWidth, layoutHeight: element.offsetHeight,
      scaleX: matrix.a, scaleY: matrix.d,
    };
  });
  expect(size.scaleX).toBe(1);
  expect(size.scaleY).toBe(1);
  expect(Math.abs(size.width - size.layoutWidth)).toBeLessThanOrEqual(.51);
  expect(Math.abs(size.height - size.layoutHeight)).toBeLessThanOrEqual(.51);
  expect(size.height).toBeGreaterThanOrEqual(56);
  if (expectedSize) {
    expect(size.width).toBe(expectedSize);
    expect(size.height).toBe(expectedSize);
  }
}

async function clickInvisibleTargetMargin(button) {
  await expect(button).toBeEnabled();
  const target = await button.boundingBox();
  const face = await button.locator('.button-face').boundingBox();
  // Exercise the preserved native target outside the visible pill.
  expect(target.y + 4).toBeLessThan(face.y);
  await button.click({ position: { x: target.width / 2, y: 4 } });
}

for (const viewport of [
  { width: 360, height: 640, homeSize: 56 },
  { width: 768, height: 1024, homeSize: 56 },
  { width: 1920, height: 1080, homeSize: 72 },
]) {
  test(`bottom buttons are exactly half-size with full targets at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expectStep(page, 0);
    await expectHalfSize(primary(page));
    await expectNormalSize(page.getByRole('button', { name: '回到首頁', exact: true }), viewport.homeSize);
    await page.screenshot({ path: testInfo.outputPath(`buttons-cover-${viewport.width}x${viewport.height}.png`) });

    await clickInvisibleTargetMargin(primary(page));
    await expectStep(page, 1);
    await expect(primary(page)).toBeEnabled();
    await expectHalfSize(primary(page));
    await clickInvisibleTargetMargin(primary(page));
    await expect(next(page)).toBeVisible();
    await expectStep(page, 1);
    await expectHalfSize(next(page));
    await page.screenshot({ path: testInfo.outputPath(`buttons-next-${viewport.width}x${viewport.height}.png`) });
    await next(page).focus();
    await page.keyboard.press('Enter');
    await expectStep(page, 2);
    await expect(primary(page)).toBeEnabled();

    const home = page.getByRole('button', { name: '回到首頁', exact: true });
    await expectNormalSize(home, viewport.homeSize);
    await home.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectNormalSize(dialog.getByRole('button', { name: '繼續製作', exact: true }));
    await expectNormalSize(dialog.getByRole('button', { name: '回到首頁', exact: true }));

    if (viewport.width !== 768) {
      await dialog.getByRole('button', { name: '回到首頁', exact: true }).click();
      await expectStep(page, 0);
      return;
    }

    // One representative full journey covers every step operation and Replay
    // without repeating the broader game/offline acceptance suite.
    await dialog.getByRole('button', { name: '繼續製作', exact: true }).click();
    for (let step = 2; step <= 7; step += 1) {
      await expectStep(page, step);
      await expect(primary(page)).toBeEnabled();
      await expectHalfSize(primary(page));
      for (let count = 0; count < ([3, 5].includes(step) ? 3 : 1); count += 1) {
        await expect(primary(page)).toBeEnabled();
        await primary(page).click();
      }
      await expect(next(page)).toBeVisible();
      await expectHalfSize(next(page));
      await next(page).click();
    }
    await expectStep(page, 8);
    await expect(next(page)).toBeVisible({ timeout: 7_000 });
    await expectHalfSize(next(page));
    await next(page).click();
    await expectStep(page, 9);
    await expect(primary(page)).toContainText('再做一次');
    await expectHalfSize(primary(page));
    await page.screenshot({ path: testInfo.outputPath('buttons-replay-768x1024.png') });
    await clickInvisibleTargetMargin(primary(page));
    await expectStep(page, 0);
  });
}
