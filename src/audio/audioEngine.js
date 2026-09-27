import { createSoundBank } from './soundBank.js';

const ACTION_SOUNDS = { 1: 'flour', 2: 'water', 3: 'knead', 4: 'place', 5: 'fold', 6: 'place' };
const LEVELS = { click: .16, flour: .55, water: .55, knead: .48, fold: .52,
  place: .40, tick: .25, tickFinal: .32, celebrate: .46 };
const GROUPS = { click: 'ui', tick: 'tick', tickFinal: 'tick', celebrate: 'celebration' };

/** An audio-only observer: it never advances or writes to the game clock. */
export function createAudioEngine({
  contextFactory = () => {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    return AudioContext ? new AudioContext({ latencyHint: 'interactive' }) : null;
  },
  soundBankFactory = createSoundBank,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let context;
  let bank;
  let master;
  let musicBus;
  let steamBus;
  let effectsBus;
  let music;
  let steam;
  let requested = false;
  let disposed = false;
  let hidden = false;
  let suspendTimer;
  let resumePromise;
  let previous;
  let state = { step: 0, phase: 'idle', count: 0, countdown: 5, progress: 0, paused: false };
  let lastClick = -Infinity;
  const voices = new Map();
  const targets = new WeakMap();

  const paused = () => hidden || state.paused;
  const running = () => requested && context?.state === 'running' && !paused() && !disposed;

  function ramp(parameter, value, seconds = .08) {
    if (targets.get(parameter) === value) return;
    targets.set(parameter, value);
    const now = context.currentTime;
    // Hold the instantaneous value when supported, so repeated gestures never
    // restart a fade from an old scheduled target (notably on mobile Safari).
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(now);
    else {
      const current = parameter.value;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(current, now);
    }
    parameter.linearRampToValueAtTime(value, now + seconds);
  }

  function stopVoice(voice, fade = .025) {
    if (!voice || voice.stopping) return;
    voice.stopping = true;
    ramp(voice.gain.gain, 0, fade);
    try { voice.source.stop(context.currentTime + fade + .005); } catch { /* already ended */ }
  }

  function source(name, bus, volume, loop = false) {
    const audio = context.createBufferSource();
    const gain = context.createGain();
    audio.buffer = bank[name];
    audio.loop = loop;
    gain.gain.setValueAtTime(loop ? 0 : volume, context.currentTime);
    audio.connect(gain);
    gain.connect(bus);
    const voice = { source: audio, gain, stopping: false };
    audio.onended = () => {
      audio.disconnect();
      gain.disconnect();
      for (const [group, current] of voices) if (current === voice) voices.delete(group);
      if (music === voice) music = null;
      if (steam === voice) steam = null;
    };
    audio.start();
    if (loop) ramp(gain.gain, volume, .35);
    return voice;
  }

  function syncMix() {
    if (!context || !bank || !requested || disposed) return;
    if (paused()) {
      ramp(master.gain, 0, .045);
      for (const voice of voices.values()) stopVoice(voice, .02);
      voices.clear();
      stopVoice(steam, .035);
      steam = null;
      if (!suspendTimer && context.state === 'running') {
        suspendTimer = setTimer(() => {
          suspendTimer = null;
          if (!disposed && paused() && context.state === 'running') {
            try {
              Promise.resolve(context.suspend()).then(() => {
                // iOS may finish suspension after the user already returned.
                if (!disposed && !paused()) return resume();
              }).catch(() => {});
            } catch { /* audio must never block the game */ }
          }
        }, 80);
      }
      return;
    }
    if (suspendTimer) clearTimer(suspendTimer);
    suspendTimer = null;
    if (context.state !== 'running') return;
    ramp(master.gain, .68, .14);
    if (!music) music = source('music', musicBus, 1, true);
    const ducked = state.phase === 'action' || state.phase === 'countdown' || state.step === 9;
    ramp(musicBus.gain, ducked ? .065 : .105, .3);
    const steaming = state.step === 7 && (
      (state.phase === 'action' && state.progress >= .81)
      || state.phase === 'settling' || state.phase === 'ready');
    if (steaming && !steam) steam = source('steam', steamBus, 1, true);
    if (!steaming && steam) {
      stopVoice(steam, .12);
      steam = null;
    }
  }

  function play(name) {
    if (!running() || !bank?.[name]) return;
    const group = GROUPS[name] || 'action';
    stopVoice(voices.get(group), .012);
    voices.set(group, source(name, effectsBus, LEVELS[name]));
  }

  function initialize() {
    if (context || disposed) return;
    context = contextFactory();
    if (!context) return;
    master = context.createGain();
    master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = .003;
    limiter.release.value = .18;
    musicBus = context.createGain();
    musicBus.gain.value = 0;
    steamBus = context.createGain();
    steamBus.gain.value = .10;
    effectsBus = context.createGain();
    for (const bus of [musicBus, steamBus, effectsBus]) bus.connect(limiter);
    limiter.connect(master);
    master.connect(context.destination);
    bank = soundBankFactory(context);
    context.onstatechange = () => { if (context.state === 'running') syncMix(); };
    // A one-frame silent buffer and resume() both run inside the first gesture,
    // covering Safari's gesture gate without autoplay or an HTML media element.
    const unlockBuffer = context.createBufferSource();
    unlockBuffer.buffer = context.createBuffer(1, 1, context.sampleRate);
    unlockBuffer.connect(master);
    unlockBuffer.onended = () => unlockBuffer.disconnect();
    unlockBuffer.start();
  }

  function resume() {
    if (!context || context.state === 'closed' || paused() || disposed) return Promise.resolve(false);
    if (context.state === 'running') {
      syncMix();
      return Promise.resolve(true);
    }
    // Call resume again on a fresh gesture, including Safari's 'interrupted'
    // state. Never depend on an old, gesture-blocked promise resolving first.
    let resuming;
    try { resuming = context.resume(); } catch { return Promise.resolve(false); }
    const attempt = Promise.resolve(resuming).then(() => {
      if (disposed) return false;
      syncMix();
      return running();
    }).catch(() => false).finally(() => {
      if (resumePromise === attempt) resumePromise = null;
    });
    resumePromise = attempt;
    return attempt;
  }

  function unlock() {
    if (disposed) return Promise.resolve(false);
    requested = true;
    try {
      initialize();
      return resume();
    } catch {
      // Audio is optional: unsupported devices must retain the complete game.
      return Promise.resolve(false);
    }
  }

  function update(snapshot) {
    if (disposed) return;
    const before = previous;
    state = { step: snapshot.step, phase: snapshot.phase, count: snapshot.count,
      countdown: snapshot.countdown, progress: snapshot.progress, paused: snapshot.paused };
    previous = state;
    if (before && before.step !== state.step) {
      for (const [group, voice] of voices) {
        if (group === 'ui') continue;
        stopVoice(voice);
        voices.delete(group);
      }
    }
    syncMix();
    // A modal closing gets one resume attempt. An OS interruption waits for
    // visibility restoration or the next gesture, never a retry on every frame.
    if (requested && before?.paused && !paused()) resume();
    if (paused()) return;
    if (state.phase === 'action' && (before?.phase !== 'action' || before?.step !== state.step || before?.count !== state.count)) {
      play(ACTION_SOUNDS[state.step]);
    }
    if (state.step === 8 && state.phase === 'countdown'
      && (before?.step !== 8 || before?.phase !== 'countdown' || before?.countdown !== state.countdown)) {
      play(state.countdown === 1 ? 'tickFinal' : 'tick');
    }
    if (state.step === 9 && before?.step !== 9) play('celebrate');
  }

  return {
    unlock,
    update,
    click() {
      if (!running() || context.currentTime - lastClick < .09) return;
      lastClick = context.currentTime;
      play('click');
    },
    setHidden(value) {
      hidden = Boolean(value);
      syncMix();
      if (!hidden && requested) resume();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      if (suspendTimer) clearTimer(suspendTimer);
      if (!context) return;
      context.onstatechange = null;
      for (const voice of [...voices.values(), music, steam]) stopVoice(voice, .01);
      voices.clear();
      // Closing also releases nodes waiting on an interrupted/suspended context.
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* already closed */ }
    },
  };
}
