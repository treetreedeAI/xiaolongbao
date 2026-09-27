/**
 * A small, browser-independent game clock. Only active time advances the game;
 * the React adapter supplies timestamps and the page/modal pause state.
 */
export const GAME_TIMINGS = Object.freeze({
  entering: 420,
  action: 900,
  steaming: 4800,
  repetition: 360,
  settling: 450,
  reducedAction: 120,
  reducedEntering: 120,
  reducedSettling: 180,
  countdown: 5000,
});

const REPETITION_STEPS = new Set([3, 5]);
const TIMED_PHASES = new Set(['entering', 'action', 'settling', 'countdown']);

export function createBunGameMachine({ reducedMotion = false } = {}) {
  const listeners = new Set();
  let lastTimestamp = null;
  let elapsed = 0;
  let duration = 0;
  let state = initialState(0, false, reducedMotion);

  function initialState(step, paused, reduceMotion) {
    return Object.freeze({
      step,
      phase: 'idle',
      count: 0,
      progress: 0,
      countdown: 5,
      countdownProgress: 0,
      paused,
      busy: paused,
      ready: false,
      entering: false,
      reducedMotion: reduceMotion,
    });
  }

  function publish(next) {
    const snapshot = {
      ...next,
      busy: next.paused || TIMED_PHASES.has(next.phase),
      ready: next.phase === 'ready',
      entering: next.phase === 'entering',
    };
    if (Object.keys(snapshot).every((key) => snapshot[key] === state[key])) return;
    state = Object.freeze(snapshot);
    for (const listener of listeners) listener();
  }

  function actionDuration() {
    if (state.reducedMotion) return GAME_TIMINGS.reducedAction;
    if (state.step === 7) return GAME_TIMINGS.steaming;
    return REPETITION_STEPS.has(state.step)
      ? GAME_TIMINGS.repetition
      : GAME_TIMINGS.action;
  }

  function settlingDuration() {
    return state.reducedMotion
      ? GAME_TIMINGS.reducedSettling
      : GAME_TIMINGS.settling;
  }

  function enteringDuration() {
    return state.reducedMotion
      ? GAME_TIMINGS.reducedEntering
      : GAME_TIMINGS.entering;
  }

  function reset(step) {
    elapsed = 0;
    duration = 0;
    publish(initialState(step, state.paused, state.reducedMotion));
  }

  function enterStep(step) {
    elapsed = 0;
    duration = step === 9 ? 0 : enteringDuration();
    const next = {
      ...initialState(step, state.paused, state.reducedMotion),
      phase: step === 9 ? 'done' : 'entering',
    };
    if (step === 9) {
      next.countdown = 1;
      next.countdownProgress = 1;
    }
    publish(next);
  }

  function advance(delta) {
    if (!Number.isFinite(delta) || state.paused || !TIMED_PHASES.has(state.phase) || delta <= 0) return;
    let remaining = delta;
    let next = { ...state };

    // Carry over time within one step, but never advance to another screen
    // without an explicit next() action. Timer entry starts a fresh clock.
    while (remaining > 0 && TIMED_PHASES.has(next.phase)) {
      const consumed = Math.min(remaining, Math.max(0, duration - elapsed));
      elapsed += consumed;
      remaining -= consumed;

      if (next.phase === 'countdown') {
        next.countdownProgress = Math.min(1, elapsed / GAME_TIMINGS.countdown);
        next.countdown = Math.max(1, Math.ceil((GAME_TIMINGS.countdown - elapsed) / 1000));
      } else if (next.phase === 'action' || next.phase === 'entering') {
        next.progress = Math.min(1, elapsed / duration);
      }

      if (elapsed < duration) break;
      elapsed = 0;

      if (next.phase === 'entering') {
        next.phase = next.step === 8 ? 'countdown' : 'idle';
        next.progress = 0;
        duration = next.step === 8 ? GAME_TIMINGS.countdown : 0;
        // A late entry frame was still displaying the transition. Start the
        // complete five-second countdown from this frame instead of charging
        // its entry overshoot against the first visible second of "5".
        if (next.step === 8) remaining = 0;
      } else if (next.phase === 'action') {
        next.count += 1;
        if (REPETITION_STEPS.has(next.step) && next.count < 3) {
          next.phase = 'idle';
          next.progress = 0;
          duration = 0;
        } else {
          next.phase = 'settling';
          next.progress = 1;
          duration = settlingDuration();
        }
      } else if (next.phase === 'settling') {
        next.phase = 'ready';
        duration = 0;
      } else {
        next.phase = 'ready';
        next.countdown = 1;
        next.countdownProgress = 1;
        duration = 0;
      }
    }
    publish(next);
  }

  function tick(timestamp) {
    if (!Number.isFinite(timestamp)) return;
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
      return;
    }
    // A stale timestamp must not rewind the clock and double-count later time.
    const currentTimestamp = Math.max(lastTimestamp, timestamp);
    const delta = currentTimestamp - lastTimestamp;
    lastTimestamp = currentTimestamp;
    advance(delta);
  }

  function synchronize(timestamp) {
    if (timestamp !== undefined) tick(timestamp);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tick,
    // Useful for deterministic tests, without a browser or wall-clock delays.
    advance,
    begin(timestamp) {
      synchronize(timestamp);
      if (state.step !== 0 || state.paused) return false;
      enterStep(1);
      return true;
    },
    next(timestamp) {
      synchronize(timestamp);
      if (state.paused || state.phase !== 'ready' || state.step < 1 || state.step > 8) {
        return false;
      }
      // Entry is published synchronously, so repeated clicks cannot skip a
      // screen while React is still rendering the first navigation event.
      enterStep(state.step + 1);
      return true;
    },
    act(timestamp) {
      synchronize(timestamp);
      if (state.paused || state.phase !== 'idle' || state.step < 1 || state.step > 7) {
        return false;
      }
      elapsed = 0;
      duration = actionDuration();
      // Synchronous state publication closes the gate before a second event can
      // arrive, even when React has not rendered the first event's update yet.
      publish({ ...state, phase: 'action', progress: 0 });
      return true;
    },
    replay(timestamp) {
      synchronize(timestamp);
      reset(0);
    },
    goHome(timestamp) {
      synchronize(timestamp);
      reset(0);
    },
    setPaused(paused, timestamp) {
      synchronize(timestamp);
      publish({ ...state, paused: Boolean(paused) });
    },
    setReducedMotion(reduceMotion, timestamp) {
      synchronize(timestamp);
      const reduced = Boolean(reduceMotion);
      if (reduced === state.reducedMotion) return;
      const fraction = duration > 0 ? elapsed / duration : 0;
      const next = { ...state, reducedMotion: reduced };
      if (next.phase === 'entering') {
        duration = reduced ? GAME_TIMINGS.reducedEntering : GAME_TIMINGS.entering;
        elapsed = fraction * duration;
      } else if (next.phase === 'action') {
        duration = reduced
          ? GAME_TIMINGS.reducedAction
          : next.step === 7
            ? GAME_TIMINGS.steaming
            : REPETITION_STEPS.has(next.step)
              ? GAME_TIMINGS.repetition
              : GAME_TIMINGS.action;
        elapsed = fraction * duration;
      } else if (next.phase === 'settling') {
        duration = reduced ? GAME_TIMINGS.reducedSettling : GAME_TIMINGS.settling;
        elapsed = fraction * duration;
      }
      // The countdown remains five seconds with either motion preference.
      publish(next);
    },
  };
}
