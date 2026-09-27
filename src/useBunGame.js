import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { createBunGameMachine } from './gameMachine.js';

const motionQuery = '(prefers-reduced-motion: reduce)';
const now = () => (typeof performance === 'undefined' ? 0 : performance.now());

export function useBunGame() {
  const machineRef = useRef(null);
  const modalOpenRef = useRef(false);
  if (machineRef.current === null) {
    machineRef.current = createBunGameMachine({
      reducedMotion: typeof window !== 'undefined' && window.matchMedia(motionQuery).matches,
    });
  }
  const machine = machineRef.current;
  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot, machine.getSnapshot);

  const refreshPause = useCallback(() => {
    const hidden = typeof document !== 'undefined' && document.hidden;
    machine.setPaused(hidden || modalOpenRef.current, now());
  }, [machine]);

  useEffect(() => {
    let mounted = true;
    let frame = null;
    const preference = window.matchMedia(motionQuery);

    function schedule() {
      const current = machine.getSnapshot();
      const active = !current.paused && ['entering', 'action', 'settling', 'countdown'].includes(current.phase);
      if (!mounted || !active) {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
      } else if (frame === null) {
        frame = requestAnimationFrame((timestamp) => {
          frame = null;
          if (!mounted) return;
          machine.tick(timestamp);
          schedule();
        });
      }
    }

    function motionChanged(event) {
      machine.setReducedMotion(event.matches, now());
    }

    machine.tick(now());
    refreshPause();
    const unsubscribe = machine.subscribe(schedule);
    document.addEventListener('visibilitychange', refreshPause);
    preference.addEventListener('change', motionChanged);
    schedule();

    return () => {
      mounted = false;
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe();
      document.removeEventListener('visibilitychange', refreshPause);
      preference.removeEventListener('change', motionChanged);
      // Freeze an in-progress clock between Strict Mode effect remounts too.
      machine.setPaused(true, now());
    };
  }, [machine, refreshPause]);

  const begin = useCallback(() => machine.begin(now()), [machine]);
  const next = useCallback(() => machine.next(now()), [machine]);
  const act = useCallback(() => machine.act(now()), [machine]);

  const replay = useCallback(() => {
    modalOpenRef.current = false;
    refreshPause();
    machine.replay(now());
  }, [machine, refreshPause]);

  const goHome = useCallback(() => {
    modalOpenRef.current = false;
    refreshPause();
    machine.goHome(now());
  }, [machine, refreshPause]);

  const setModalOpen = useCallback((open) => {
    modalOpenRef.current = Boolean(open);
    refreshPause();
  }, [refreshPause]);

  return { ...snapshot, begin, next, act, replay, goHome, setModalOpen };
}
