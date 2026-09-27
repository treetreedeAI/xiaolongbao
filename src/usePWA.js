import { useCallback, useEffect, useRef, useState } from 'react';

const isDevelopment = import.meta.env.DEV;

function readStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function workerRequest(worker, type, timeout = 15000, shell = null) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error('Offline worker did not respond.'));
    }, timeout);
    channel.port1.onmessage = ({ data }) => {
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(data);
    };
    try {
      worker.postMessage({ type, shell }, [channel.port2]);
    } catch (error) {
      window.clearTimeout(timer);
      channel.port1.close();
      reject(error);
    }
  });
}

/** Installation is progressive enhancement; the game never depends on it. */
export function usePWA({ canReload = false } = {}) {
  const [cacheState, setCacheState] = useState(isDevelopment ? 'development' : 'loading');
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [standalone, setStandalone] = useState(readStandalone);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [retry, setRetry] = useState(0);
  const installBusy = useRef(false);
  const safeToReload = useRef(canReload);
  const resumeUpdate = useRef(() => {});
  const reloading = useRef(false);
  const observedVersion = useRef(null);
  const shell = useRef(document.querySelector('script[type="module"][src]')?.src || null);
  safeToReload.current = canReload;
  const [isIOS] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  useEffect(() => {
    const updateConnection = () => setIsOffline(!navigator.onLine);
    const updateStandalone = () => setStandalone(readStandalone());
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const beforeInstall = (event) => {
      event.preventDefault();
      if (!readStandalone()) setInstallPrompt(event);
    };
    const installed = () => {
      setInstallPrompt(null);
      setStandalone(true);
    };
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    if (displayMode.addEventListener) displayMode.addEventListener('change', updateStandalone);
    else displayMode.addListener(updateStandalone);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      if (displayMode.removeEventListener) displayMode.removeEventListener('change', updateStandalone);
      else displayMode.removeListener(updateStandalone);
    };
  }, []);

  useEffect(() => { resumeUpdate.current(); }, [canReload]);

  useEffect(() => {
    if (isDevelopment) return undefined;
    if (!('serviceWorker' in navigator) || !window.isSecureContext || !('caches' in window)) {
      setCacheState('unsupported');
      return undefined;
    }

    let disposed = false;
    let registration;
    let checking = false;
    let checkAgain = false;
    let updating = false;
    let applying = false;
    let pendingVersion = null;
    const watched = new Set();
    const cleanups = [];
    const setState = (state) => { if (!disposed) setCacheState(state); };
    setState('loading');

    // Guard against a server that stalls without failing. Retrying is always available.
    const loadingTimeout = window.setTimeout(() => setState('error'), 90000);
    const reloadAtCover = () => {
      if (disposed || !pendingVersion || !safeToReload.current
        || document.visibilityState !== 'visible' || reloading.current) return;
      // This guard also prevents a reload loop if a host incorrectly serves a
      // stale HTML shell after the new worker has already taken control.
      const key = `little-bun-reloaded:${registration?.scope || document.baseURI}`;
      try {
        if (sessionStorage.getItem(key) === pendingVersion) return;
        sessionStorage.setItem(key, pendingVersion);
      } catch { /* Private modes may disallow sessionStorage; the ref still guards this document. */ }
      reloading.current = true;
      window.location.reload();
    };
    const applyStatus = (data) => {
      if (data?.type !== 'OFFLINE_STATUS') throw new Error('Invalid offline response.');
      setState(data.state === 'ready' ? 'ready' : 'error');
      window.clearTimeout(loadingTimeout);
      // Compare the running document's real module URL, not just controller
      // identity: a new controller can already exist when an old shell mounts.
      const shellChanged = data.shell && shell.current && data.shell !== shell.current;
      const pinnedToPrevious = data.clientVersion && data.clientVersion !== data.version;
      const controllerUpdated = observedVersion.current && observedVersion.current !== data.version;
      observedVersion.current = data.version;
      if (data.state === 'ready' && (shellChanged || pinnedToPrevious || controllerUpdated)) {
        pendingVersion = data.version;
        reloadAtCover();
      }
    };
    const checkActive = async (repair = false) => {
      const worker = navigator.serviceWorker.controller || registration?.active;
      if (!worker || worker.state !== 'activated' || disposed) return;
      if (checking) { checkAgain = true; return; }
      checking = true;
      try {
        applyStatus(await workerRequest(worker, repair ? 'PRECACHE_RETRY' : 'OFFLINE_STATUS', repair ? 90000 : 15000, shell.current));
      } catch {
        setState('error');
        window.clearTimeout(loadingTimeout);
      } finally {
        checking = false;
        if (checkAgain && !disposed) {
          checkAgain = false;
          void checkActive();
        }
      }
    };
    const applyWaiting = async () => {
      const worker = registration?.waiting;
      if (!worker || disposed || applying || !safeToReload.current
        || document.visibilityState !== 'visible') return;
      applying = true;
      try {
        const status = await workerRequest(worker, retry > 0 ? 'PRECACHE_RETRY' : 'OFFLINE_STATUS', retry > 0 ? 90000 : 15000);
        if (status?.state !== 'ready') {
          setState('error');
          return;
        }
        // The child may have pressed Start while the status check was pending.
        if (!safeToReload.current || document.visibilityState !== 'visible' || disposed) return;
        const result = await workerRequest(worker, 'APPLY_UPDATE');
        if (result?.type !== 'UPDATE_STATUS' || result.state !== 'applying') setState('error');
      } catch {
        // If activation won the race, controllerchange performs the check.
        if (worker.state !== 'activated' && worker.state !== 'redundant') setState('error');
      } finally {
        applying = false;
      }
    };
    const watchWorker = (worker) => {
      if (!worker || watched.has(worker)) return;
      watched.add(worker);
      const stateChanged = () => {
        if (worker.state === 'installed') void applyWaiting();
        if (worker.state === 'activated') void checkActive(retry > 0);
        if (worker.state === 'redundant') {
          if (navigator.serviceWorker.controller || registration?.active) void checkActive();
          else {
            setState('error');
            window.clearTimeout(loadingTimeout);
          }
        }
      };
      worker.addEventListener('statechange', stateChanged);
      cleanups.push(() => worker.removeEventListener('statechange', stateChanged));
      stateChanged();
    };
    const controlled = () => void checkActive();
    const checkForUpdate = async () => {
      if (!registration || disposed || updating || !navigator.onLine) return;
      updating = true;
      try {
        await registration.update();
        if (disposed) return;
        watchWorker(registration.installing);
        watchWorker(registration.waiting);
        await applyWaiting();
      } catch {
        // A network/update failure must not invalidate a complete offline game.
        // checkActive independently reports whether that cached game is ready.
      } finally {
        updating = false;
      }
    };
    const resume = () => {
      reloadAtCover();
      void applyWaiting();
    };
    resumeUpdate.current = resume;
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      void checkActive();
      void checkForUpdate();
      resume();
    };
    navigator.serviceWorker.addEventListener('controllerchange', controlled);
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('online', recheck);

    (async () => {
      try {
        // Resolve relative to the document, so /school/buns/ works like /.
        const base = new URL(import.meta.env.BASE_URL, document.baseURI);
        registration = await navigator.serviceWorker.register(new URL('sw.js', base), {
          scope: base.pathname,
          updateViaCache: 'none',
        });
        if (disposed) return;
        const updateFound = () => watchWorker(registration.installing);
        registration.addEventListener('updatefound', updateFound);
        cleanups.push(() => registration.removeEventListener('updatefound', updateFound));
        watchWorker(registration.installing);
        watchWorker(registration.waiting);
        watchWorker(registration.active);
        await checkActive(retry > 0);
        await applyWaiting();
        // Explicit startup and foreground checks avoid relying on the browser's
        // otherwise opportunistic update schedule.
        await checkForUpdate();
      } catch {
        setState('error');
        window.clearTimeout(loadingTimeout);
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(loadingTimeout);
      navigator.serviceWorker.removeEventListener('controllerchange', controlled);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('online', recheck);
      if (resumeUpdate.current === resume) resumeUpdate.current = () => {};
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [retry]);

  const install = useCallback(async () => {
    if (!installPrompt || standalone || installBusy.current) return false;
    installBusy.current = true;
    setInstallPrompt(null);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      return choice?.outcome === 'accepted';
    } catch {
      return false;
    } finally {
      installBusy.current = false;
    }
  }, [installPrompt, standalone]);

  const retryOffline = useCallback(() => setRetry((value) => value + 1), []);

  return { cacheState, isOffline, canInstall: Boolean(installPrompt) && !standalone,
    isIOS, standalone, install, retryOffline };
}
