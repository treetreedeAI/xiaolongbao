import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
await mkdir('output/previews', { recursive: true });
await page.goto(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173/');
await page.getByTestId('cache-status').waitFor();
await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth));
await page.screenshot({ path: 'output/previews/00-cover.png' });
await page.getByTestId('primary-action').click();
for (let step = 1; step <= 7; step++) {
  await page.waitForFunction(() => document.querySelector('[data-testid="game-shell"]').dataset.phase === 'idle');
  await page.screenshot({ path: `output/previews/0${step}-before.png` });
  const repetitions = step === 3 || step === 5 ? 3 : 1;
  for (let i = 0; i < repetitions; i++) {
    await page.getByTestId('primary-action').click();
    await page.waitForFunction(() => ['idle', 'ready'].includes(document.querySelector('[data-testid="game-shell"]').dataset.phase));
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `output/previews/0${step}-after.png` });
  await page.getByTestId('next-action').click();
}
await page.waitForFunction(() => document.querySelector('[data-testid="game-shell"]').dataset.phase === 'countdown');
await page.screenshot({ path: 'output/previews/08-clock.png' });
await page.getByTestId('next-action').click();
await page.waitForTimeout(1000);
await page.screenshot({ path: 'output/previews/09-done.png' });
await browser.close();
