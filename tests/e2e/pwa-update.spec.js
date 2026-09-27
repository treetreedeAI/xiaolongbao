import { createServer } from 'node:http';
import { cp, mkdtemp, mkdir, readFile, writeFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { test, expect } from '@playwright/test';
import { buildServiceWorker } from '../../scripts/build-sw.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scope = '/school/buns/';
let directory;
let versions;

async function fixtureFiles(root) {
  await mkdir(join(root, 'assets/icons'), { recursive: true });
  for (const name of ['icon-192', 'icon-512', 'maskable-512', 'apple-touch-icon']) {
    await writeFile(join(root, `assets/icons/${name}.png`), Buffer.from('fixture-icon'));
  }
  await writeFile(join(root, 'manifest.webmanifest'), '{"name":"PWA update fixture","start_url":"./"}');
}

async function modernFixture(name) {
  const root = join(directory, name);
  await mkdir(root);
  await writeFile(join(root, 'index.html'), '<div id="root"></div><script type="module" src="./entry.jsx"></script>');
  await writeFile(join(root, 'entry.jsx'), `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { usePWA } from ${JSON.stringify(join(project, 'src/usePWA.js'))};
    function Fixture() {
      const [step, setStep] = useState(0);
      const pwa = usePWA({ canReload: step === 0 });
      return <main data-testid="game-shell" data-step={step}>
        <p data-testid="build">${name}</p>
        <p data-testid="cache-state">{pwa.cacheState}</p>
        <button onClick={() => setStep(1)}>Start</button>
        <button onClick={() => setStep(0)}>Home</button>
        <button onClick={pwa.retryOffline}>Retry</button>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  `);
  await build({
    configFile: false, root, base: './', logLevel: 'silent',
    resolve: { alias: { 'react-dom': join(project, 'node_modules/react-dom'), react: join(project, 'node_modules/react') } },
    build: { outDir: 'dist', emptyOutDir: true },
  });
  const dist = join(root, 'dist');
  await fixtureFiles(dist);
  await writeFile(join(dist, 'assets/art.txt'), name);
  const { version } = await buildServiceWorker(dist);
  return { dist, version };
}

async function legacyFixture() {
  const dist = join(directory, 'legacy');
  await mkdir(dist);
  await fixtureFiles(dist);
  await writeFile(join(dist, 'assets/art.txt'), 'legacy');
  await writeFile(join(dist, 'index.html'), `<main data-testid="game-shell" data-step="0">
    <p data-testid="build">legacy</p><p data-testid="cache-state">loading</p>
    <button id="start">Start</button><button id="home">Home</button>
    </main><script type="module" src="./assets/entry-legacy.js"></script>`);
  // The pre-fix page only checked cache readiness on controllerchange. It had
  // no waiting/APPLY_UPDATE/version comparison/reload handling.
  await writeFile(join(dist, 'assets/entry-legacy.js'), `
    document.querySelector('#start').onclick = () => document.querySelector('main').dataset.step = '1';
    document.querySelector('#home').onclick = () => document.querySelector('main').dataset.step = '0';
    async function check() {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = ({ data }) => document.querySelector('[data-testid="cache-state"]').textContent = data.state;
      worker.postMessage({ type: 'OFFLINE_STATUS' }, [channel.port2]);
    }
    navigator.serviceWorker.addEventListener('controllerchange', check);
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(check);
  `);
  const paths = ['index.html', 'manifest.webmanifest', 'assets/art.txt', 'assets/entry-legacy.js',
    ...((await readdir(join(dist, 'assets/icons'))).map((name) => `assets/icons/${name}`))];
  // Frozen legacy lifecycle/protocol: cache-first shell, no skipWaiting, and
  // only OFFLINE_STATUS / PRECACHE_RETRY. This is a real browser SW, not a mock.
  await writeFile(join(dist, 'sw.js'), `
    const VERSION = 'legacy';
    const BASE = self.registration.scope;
    const PREFIX = 'little-bun-' + encodeURIComponent(BASE) + '-';
    const CACHE = PREFIX + VERSION;
    const URLS = ${JSON.stringify(paths)}.map(path => new URL(path, BASE).href);
    const INDEX = new URL('index.html', BASE).href;
    const MARKER = new URL('__little_bun_offline_ready__', BASE).href;
    async function complete() {
      const c = await caches.open(CACHE);
      return !!await c.match(MARKER) && (await Promise.all(URLS.map(url => c.match(url)))).every(Boolean);
    }
    async function precache() {
      const c = await caches.open(CACHE);
      await c.addAll(URLS.map(url => new Request(url, { cache: 'reload' })));
      await c.put(MARKER, new Response(VERSION));
    }
    self.addEventListener('install', event => event.waitUntil(precache()));
    self.addEventListener('activate', event => event.waitUntil((async () => {
      for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()));
    self.addEventListener('message', event => {
      if (!['OFFLINE_STATUS', 'PRECACHE_RETRY'].includes(event.data?.type)) return;
      event.waitUntil((async () => {
        if (event.data.type === 'PRECACHE_RETRY' && !await complete()) await precache();
        event.ports[0]?.postMessage({ type: 'OFFLINE_STATUS', state: await complete() ? 'ready' : 'error', version: VERSION });
      })());
    });
    self.addEventListener('fetch', event => {
      const url = new URL(event.request.url);
      if (event.request.method !== 'GET' || !url.href.startsWith(BASE)) return;
      if (event.request.mode === 'navigate') {
        event.respondWith(caches.open(CACHE).then(async cache => await cache.match(INDEX) || fetch(event.request)));
        return;
      }
      url.search = '';
      if (URLS.includes(url.href)) event.respondWith(caches.open(CACHE).then(async cache => await cache.match(url.href) || fetch(event.request)));
    });
  `);
  return { dist, version: 'legacy' };
}

async function serverFor(initial) {
  let current = initial;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://fixture.test').pathname;
      if (!pathname.startsWith(scope)) { response.writeHead(404).end(); return; }
      const relative = pathname.slice(scope.length) || 'index.html';
      const filename = join(current.dist, relative);
      const content = await readFile(filename);
      const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
      response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404).end('not found'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}${scope}`,
    deploy(next) { current = next; },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function ready(page) {
  await expect(page.getByTestId('cache-state')).toHaveText('ready');
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
}

async function waiting(page) {
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(true);
}

async function message(page, target, type) {
  return page.evaluate(async ({ target, type }) => {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = target === 'controller' ? navigator.serviceWorker.controller : registration[target];
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(Error('SW response timed out')), 5000);
      channel.port1.onmessage = ({ data }) => { clearTimeout(timer); resolve(data); };
      worker.postMessage({ type }, [channel.port2]);
    });
  }, { target, type });
}

async function foreground(page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

test.beforeAll(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'little-bun-pwa-update-')));
  versions = { legacy: await legacyFixture(), a: await modernFixture('modern-a'), b: await modernFixture('modern-b') };
  const dist = join(directory, 'art-only');
  await cp(versions.a.dist, dist, { recursive: true });
  await writeFile(join(dist, 'assets/art.txt'), 'new-art-same-js');
  const { version } = await buildServiceWorker(dist);
  versions.artOnly = { dist, version };
});
test.afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('legacy cached first reopen migrates at the cover without closing tabs or deleting data', async ({ browser }) => {
  const host = await serverFor(versions.legacy);
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    await page.goto(host.url);
    await ready(page);
    await page.evaluate(() => localStorage.setItem('keep-this-user-data', 'preserved'));
    const playing = await context.newPage();
    await playing.goto(host.url);
    await ready(playing);
    await playing.getByRole('button', { name: 'Start', exact: true }).click();
    await page.bringToFront();
    // Reproduce the first reopening race: old SW responds with old HTML while
    // the server now has the new build. Only this protocol-less legacy worker
    // receives the one-time complete-cache takeover, without any navigation.
    host.deploy(versions.a);
    await page.reload();
    await expect(page.getByTestId('build')).toHaveText('legacy');
    let automaticNavigations = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) automaticNavigations += 1; });
    await expect.poll(async () => (await message(page, 'controller', 'OFFLINE_STATUS')).version).toBe(versions.a.version);
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
    await expect(page.getByTestId('game-shell')).toHaveAttribute('data-step', '0');
    await expect(page.getByTestId('build')).toHaveText('legacy');
    await expect(playing.getByTestId('game-shell')).toHaveAttribute('data-step', '1');
    expect(automaticNavigations).toBe(0);
    expect(await playing.evaluate(() => fetch('./assets/art.txt').then((response) => response.text()))).toBe('legacy');
    // The legacy hook cannot reload itself. The first, explicitly confirmed
    // cover migration uses the ordinary browser Reload action exactly once,
    // not custom page code or cache deletion, and not an arbitrary playing tab.
    await page.reload();
    await expect(page.getByTestId('build')).toHaveText('modern-a');
    await ready(page);
    expect(await page.evaluate(() => localStorage.getItem('keep-this-user-data'))).toBe('preserved');
    await context.setOffline(true);
    await page.goto(`${host.url}?offline=1`);
    await expect(page.getByTestId('build')).toHaveText('modern-a');
    await ready(page);
  } finally { await context.close(); await host.close(); }
});

test('foreground update waits through gameplay then reloads only once at the cover', async ({ browser }) => {
  const host = await serverFor(versions.a);
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    await page.goto(host.url);
    await ready(page);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    let navigations = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });
    host.deploy(versions.b);
    await foreground(page);
    await waiting(page);
    await expect(page.getByTestId('game-shell')).toHaveAttribute('data-step', '1');
    expect(navigations).toBe(0);
    expect(await page.evaluate(() => fetch('./assets/art.txt').then((response) => response.text()))).toBe('modern-a');
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByTestId('build')).toHaveText('modern-b');
    await ready(page);
    await foreground(page);
    await expect(page.getByTestId('game-shell')).toHaveAttribute('data-step', '0');
    expect(navigations).toBe(1);
    expect(await page.evaluate(() => fetch('./assets/art.txt').then((response) => response.text()))).toBe('modern-b');
  } finally { await context.close(); await host.close(); }
});

test('another cover can update without reloading or swapping same-name assets in a playing tab', async ({ browser }) => {
  const host = await serverFor(versions.a);
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const playing = await context.newPage();
    await playing.goto(host.url);
    await ready(playing);
    await playing.getByRole('button', { name: 'Start', exact: true }).click();
    let navigations = 0;
    playing.on('framenavigated', (frame) => { if (frame === playing.mainFrame()) navigations += 1; });
    const cover = await context.newPage();
    await cover.goto(host.url);
    await ready(cover);
    host.deploy(versions.b);
    await foreground(cover);
    await expect(cover.getByTestId('build')).toHaveText('modern-b');
    await expect(playing.getByTestId('game-shell')).toHaveAttribute('data-step', '1');
    await expect(playing.getByTestId('build')).toHaveText('modern-a');
    expect(navigations).toBe(0);
    expect(await playing.evaluate(() => fetch('./assets/art.txt').then((response) => response.text()))).toBe('modern-a');
    expect(await cover.evaluate(() => fetch('./assets/art.txt').then((response) => response.text()))).toBe('modern-b');
    await playing.bringToFront();
    await playing.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(playing.getByTestId('build')).toHaveText('modern-b');
    expect(navigations).toBe(1);
  } finally { await context.close(); await host.close(); }
});

test('an incomplete waiting cache cannot activate, and explicit retry repairs it', async ({ browser }) => {
  const host = await serverFor(versions.a);
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    await page.goto(host.url);
    await ready(page);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    host.deploy(versions.b);
    await foreground(page);
    await waiting(page);
    await page.evaluate(async (version) => {
      const registration = await navigator.serviceWorker.getRegistration();
      const key = `little-bun-${encodeURIComponent(registration.scope)}-${version}`;
      await (await caches.open(key)).delete(new URL('assets/art.txt', registration.scope).href);
    }, versions.b.version);
    expect((await message(page, 'waiting', 'APPLY_UPDATE')).state).toBe('error');
    expect((await message(page, 'controller', 'OFFLINE_STATUS')).version).toBe(versions.a.version);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByTestId('cache-state')).toHaveText('error');
    await expect(page.getByTestId('build')).toHaveText('modern-a');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByTestId('build')).toHaveText('modern-b');
    await ready(page);
  } finally { await context.close(); await host.close(); }
});

test('an artwork-only deployment with identical JavaScript still refreshes once at the cover', async ({ browser }) => {
  const host = await serverFor(versions.a);
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    await page.goto(host.url);
    await ready(page);
    const originalScript = await page.locator('script[type="module"]').getAttribute('src');
    let navigations = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });
    host.deploy(versions.artOnly);
    await foreground(page);
    await expect.poll(() => navigations).toBe(1);
    await ready(page);
    expect(await page.locator('script[type="module"]').getAttribute('src')).toBe(originalScript);
    expect(await page.evaluate(() => fetch('./assets/art.txt').then((response) => response.text()))).toBe('new-art-same-js');
    await foreground(page);
    expect(navigations).toBe(1);
  } finally { await context.close(); await host.close(); }
});
