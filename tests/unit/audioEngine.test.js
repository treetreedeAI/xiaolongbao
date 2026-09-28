import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createAudioEngine } from '../../src/audio/audioEngine.js';

const SOUND_NAMES = ['music', 'steam', 'click', 'flour', 'water', 'knead', 'place',
  'fold', 'ignition', 'tick', 'tickFinal', 'celebrate'];
const snapshot = (changes = {}) => ({ step: 0, phase: 'idle', count: 0,
  countdown: 5, progress: 0, paused: false, ...changes });
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

class AudioParameter {
  constructor(value = 1) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['ramp', value, time]); }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
}

class AudioNode {
  constructor() { this.connections = []; this.disconnected = false; }
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnected = true; }
}

class BufferSource extends AudioNode {
  constructor() { super(); this.starts = []; this.stops = []; this.loop = false; }
  start(time) { this.starts.push(time); }
  stop(time) { this.stops.push(time); }
  finish() { this.onended?.(); }
}

class AudioContextMock {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = new AudioNode();
    this.sources = [];
    this.gains = [];
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.closeCalls = 0;
  }
  createGain() {
    const gain = Object.assign(new AudioNode(), { gain: new AudioParameter() });
    this.gains.push(gain);
    return gain;
  }
  createDynamicsCompressor() {
    return Object.assign(new AudioNode(), Object.fromEntries(
      ['threshold', 'knee', 'ratio', 'attack', 'release'].map((key) => [key, new AudioParameter()])));
  }
  createBufferSource() {
    const source = new BufferSource();
    this.sources.push(source);
    return source;
  }
  createBuffer(channels, length, sampleRate) { return { channels, length, sampleRate }; }
  transition(state) { this.state = state; this.onstatechange?.(); }
  resume() {
    this.resumeCalls += 1;
    if (this.resumeBehavior) return this.resumeBehavior();
    this.transition('running');
    return Promise.resolve();
  }
  suspend() {
    this.suspendCalls += 1;
    if (this.suspendBehavior) return this.suspendBehavior();
    this.transition('suspended');
    return Promise.resolve();
  }
  close() {
    this.closeCalls += 1;
    this.transition('closed');
    return this.closeBehavior?.() || Promise.resolve();
  }
  named(name) { return this.sources.filter((source) => source.buffer?.name === name); }
}

function fixture(options = {}) {
  const context = new AudioContextMock();
  const timers = new Map();
  let nextTimer = 1;
  let factoryCalls = 0;
  const engine = createAudioEngine({
    contextFactory: () => { factoryCalls += 1; return context; },
    soundBankFactory: () => Object.fromEntries(SOUND_NAMES.map((name) => [name, { name }])),
    setTimer: (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimer: (id) => timers.delete(id),
    ...options,
  });
  return { engine, context, timers, factoryCalls: () => factoryCalls,
    runTimers() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach(({ callback }) => callback());
    } };
}

test('audio allocates nothing before a gesture and starts one music loop after unlocking', async () => {
  const f = fixture();
  f.engine.update(snapshot());
  f.engine.update(snapshot({ step: 1, phase: 'action' }));
  f.engine.click();
  f.engine.setHidden(true);
  f.engine.setHidden(false);
  assert.equal(f.factoryCalls(), 0);
  assert.equal(f.context.sources.length, 0);

  assert.equal(await f.engine.unlock(), true);
  assert.equal(f.factoryCalls(), 1);
  assert.equal(f.context.resumeCalls, 1);
  assert.equal(f.context.named('music').length, 1);
  assert.equal(f.context.named('music')[0].loop, true);
  assert.equal(f.context.sources.filter((source) => source.buffer?.length === 1).length, 1);
  for (let frame = 0; frame < 60; frame += 1) f.engine.update(snapshot());
  await f.engine.unlock();
  assert.equal(f.factoryCalls(), 1);
  assert.equal(f.context.named('music').length, 1);
  f.engine.destroy();
});

test('a new gesture retries a pending resume and recovers an interrupted context', async () => {
  const f = fixture();
  let resolveFirst;
  f.context.resumeBehavior = () => new Promise((resolve) => { resolveFirst = resolve; });
  const first = f.engine.unlock();
  assert.equal(f.context.resumeCalls, 1);
  assert.equal(f.context.named('music').length, 0);
  for (let frame = 0; frame < 20; frame += 1) f.engine.update(snapshot());
  assert.equal(f.context.resumeCalls, 1, 'frames must not flood a pending resume');

  f.context.resumeBehavior = undefined;
  assert.equal(await f.engine.unlock(), true);
  assert.equal(f.context.resumeCalls, 2);
  resolveFirst();
  assert.equal(await first, true);
  f.context.transition('interrupted');
  assert.equal(await f.engine.unlock(), true);
  assert.equal(f.context.resumeCalls, 3);
  assert.equal(f.context.named('music').length, 1);
  f.engine.destroy();
});

test('actions sound once per action entry or repetition count, never once per frame', async () => {
  const f = fixture();
  await f.engine.unlock();
  for (const [step, sound] of [[1, 'flour'], [2, 'water'], [3, 'knead'],
    [4, 'place'], [5, 'fold'], [6, 'place']]) {
    const before = f.context.named(sound).length;
    f.engine.update(snapshot({ step, phase: 'idle' }));
    f.engine.update(snapshot({ step, phase: 'action' }));
    for (let frame = 1; frame < 60; frame += 1) {
      f.engine.update(snapshot({ step, phase: 'action', progress: frame / 60 }));
    }
    assert.equal(f.context.named(sound).length, before + 1, `step ${step}`);
    if (step === 3 || step === 5) {
      f.engine.update(snapshot({ step, phase: 'action', count: 1 }));
      f.engine.update(snapshot({ step, phase: 'action', count: 1, progress: .5 }));
      f.engine.update(snapshot({ step, phase: 'idle', count: 2 }));
      f.engine.update(snapshot({ step, phase: 'action', count: 2 }));
      assert.equal(f.context.named(sound).length, before + 3, `three repetitions in step ${step}`);
    }
  }
  f.engine.destroy();
});

test('countdown plays exactly five cues, with one final cue and no cue on the ready frame', async () => {
  const f = fixture();
  await f.engine.unlock();
  f.engine.update(snapshot({ step: 8, phase: 'entering' }));
  assert.equal(f.context.named('tick').length, 0);
  for (let countdown = 5; countdown >= 1; countdown -= 1) {
    for (let frame = 0; frame < 60; frame += 1) {
      f.engine.update(snapshot({ step: 8, phase: 'countdown', countdown, progress: frame / 60 }));
    }
  }
  f.engine.update(snapshot({ step: 8, phase: 'ready', countdown: 1, progress: 1 }));
  f.engine.update(snapshot({ step: 8, phase: 'ready', countdown: 1, progress: 1 }));
  assert.equal(f.context.named('tick').length, 4);
  assert.equal(f.context.named('tickFinal').length, 1);
  f.engine.update(snapshot({ step: 9, phase: 'done' }));
  for (let frame = 0; frame < 10; frame += 1) f.engine.update(snapshot({ step: 9, phase: 'done' }));
  assert.equal(f.context.named('celebrate').length, 1);
  f.engine.update(snapshot());
  f.engine.update(snapshot({ step: 9, phase: 'done' }));
  assert.equal(f.context.named('celebrate').length, 2, 'a later completed game may celebrate again');
  f.engine.destroy();
});

test('ignition plays once at the flame fade boundary, never on entry or subsequent frames', async () => {
  const f = fixture();
  await f.engine.unlock();
  for (const phase of ['entering', 'idle']) {
    f.engine.update(snapshot({ step: 7, phase, progress: .9 }));
  }
  for (const progress of [0, .04, .079, .07999]) {
    f.engine.update(snapshot({ step: 7, phase: 'action', progress }));
  }
  assert.equal(f.context.named('ignition').length, 0);
  f.engine.update(snapshot({ step: 7, phase: 'action', progress: .08 }));
  const ignition = f.context.named('ignition')[0];
  assert.ok(ignition);
  assert.equal(ignition.loop, false);
  assert.equal(ignition.starts.length, 1);
  assert.equal(f.context.named('steam').length, 0, 'ignition must not bring steam forward');
  for (let frame = 8; frame <= 100; frame += 1) {
    f.engine.update(snapshot({ step: 7, phase: 'action', progress: frame / 100 }));
  }
  // Completing an action increments count; it is not a second ignition cue.
  for (const phase of ['settling', 'ready', 'ready']) {
    f.engine.update(snapshot({ step: 7, phase, count: 1, progress: 1 }));
  }
  assert.equal(f.context.named('ignition').length, 1);
  assert.equal(f.context.named('music').length, 1);
  assert.equal(f.context.named('steam').length, 1);
  f.engine.destroy();
});

for (const phase of ['settling', 'ready']) {
  test(`a late reduced-motion frame reaching ${phase} still ignites exactly once`, async () => {
    const f = fixture();
    await f.engine.unlock();
    f.engine.update(snapshot({ step: 7, phase: 'idle' }));
    f.engine.update(snapshot({ step: 7, phase: 'action', progress: 0 }));
    assert.equal(f.context.named('ignition').length, 0);
    f.engine.update(snapshot({ step: 7, phase, count: 1, progress: 1 }));
    for (let frame = 0; frame < 20; frame += 1) {
      f.engine.update(snapshot({ step: 7, phase: 'ready', count: 1, progress: 1 }));
    }
    assert.equal(f.context.named('ignition').length, 1);
    f.engine.destroy();
  });
}

test('a fresh step-seven action or replay resets ignition without stacking old voices', async () => {
  const f = fixture();
  await f.engine.unlock();
  for (let count = 0; count < 3; count += 1) {
    f.engine.update(snapshot({ step: 7, phase: 'idle', count }));
    f.engine.update(snapshot({ step: 7, phase: 'action', count, progress: .08 }));
    assert.equal(f.context.named('ignition').length, count + 1);
    assert.equal(f.context.named('ignition').filter((source) => !source.stops.length).length, 1);
  }
  f.engine.update(snapshot());
  f.engine.update(snapshot({ step: 7, phase: 'entering' }));
  f.engine.update(snapshot({ step: 7, phase: 'action', progress: .08 }));
  assert.equal(f.context.named('ignition').length, 4);
  assert.equal(f.context.named('ignition').filter((source) => !source.stops.length).length, 1);
  assert.equal(f.context.named('music').length, 1);
  f.engine.destroy();
});

for (const cause of ['hidden', 'modal']) {
  for (const firedBeforePause of [true, false]) {
    test(`${cause} pause never replays ${firedBeforePause ? 'an interrupted' : 'a suppressed'} ignition cue`, async () => {
      const f = fixture();
      await f.engine.unlock();
      f.engine.update(snapshot({ step: 7, phase: 'action', progress: firedBeforePause ? .08 : .04 }));
      const ignition = f.context.named('ignition')[0];
      if (cause === 'hidden') f.engine.setHidden(true);
      f.engine.update(snapshot({ step: 7, phase: 'action', progress: .12, paused: cause === 'modal' }));
      assert.equal(f.context.named('ignition').length, firedBeforePause ? 1 : 0);
      if (ignition) assert.equal(ignition.stops.length, 1);
      f.runTimers();
      await flushPromises();
      if (cause === 'hidden') f.engine.setHidden(false);
      f.engine.update(snapshot({ step: 7, phase: 'action', progress: .12 }));
      await flushPromises();
      for (const progress of [.2, .5, .8, 1]) {
        f.engine.update(snapshot({ step: 7, phase: 'action', progress }));
      }
      assert.equal(f.context.named('ignition').length, firedBeforePause ? 1 : 0);
      assert.equal(f.context.named('music').length, 1);
      f.engine.destroy();
    });
  }
}

for (const destination of [0, 8]) {
  test(`leaving step seven for step ${destination} fade-stops its ignition`, async () => {
    const f = fixture();
    await f.engine.unlock();
    f.engine.update(snapshot({ step: 7, phase: 'action', progress: .08 }));
    const ignition = f.context.named('ignition')[0];
    f.engine.update(snapshot({ step: destination, phase: destination === 0 ? 'idle' : 'entering' }));
    assert.equal(ignition.stops.length, 1);
    assert.ok(ignition.stops[0] > f.context.currentTime, 'step exit must retain the short fade');
    f.engine.destroy();
  });
}

test('ignition never fires in another step or catches up after audio was unavailable', async () => {
  const f = fixture();
  f.engine.update(snapshot({ step: 7, phase: 'action', progress: .08 }));
  assert.equal(f.factoryCalls(), 0);
  await f.engine.unlock();
  f.engine.update(snapshot({ step: 7, phase: 'action', progress: .2 }));
  assert.equal(f.context.named('ignition').length, 0, 'a delayed unlock must not replay an old ignition');
  for (const step of [0, 1, 2, 3, 4, 5, 6, 8, 9]) {
    for (const phase of ['entering', 'idle', 'action', 'settling', 'ready']) {
      f.engine.update(snapshot({ step, phase, progress: 1 }));
    }
  }
  assert.equal(f.context.named('ignition').length, 0);
  f.engine.destroy();
});

test('steam starts at the steam animation boundary, stays one loop, and stops on leaving step seven', async () => {
  const f = fixture();
  await f.engine.unlock();
  for (const progress of [0, .4, .8099]) f.engine.update(snapshot({ step: 7, phase: 'action', progress }));
  assert.equal(f.context.named('steam').length, 0);
  f.engine.update(snapshot({ step: 7, phase: 'action', progress: .81 }));
  const steam = f.context.named('steam')[0];
  assert.ok(steam);
  assert.equal(steam.loop, true);
  for (const phase of ['action', 'settling', 'ready']) {
    f.engine.update(snapshot({ step: 7, phase, progress: 1 }));
  }
  assert.equal(f.context.named('steam').length, 1);
  assert.equal(steam.stops.length, 0);
  f.engine.update(snapshot({ step: 8, phase: 'entering' }));
  assert.equal(steam.stops.length, 1);
  assert.ok(steam.stops[0] > f.context.currentTime, 'stop should preserve the fade-out');
  f.engine.destroy();
});

test('rapid clicks are throttled and replaced action voices cannot remove their newer replacement', async () => {
  const f = fixture();
  await f.engine.unlock();
  for (let click = 0; click < 30; click += 1) f.engine.click();
  assert.equal(f.context.named('click').length, 1);
  f.context.currentTime = .089;
  f.engine.click();
  assert.equal(f.context.named('click').length, 1);
  f.context.currentTime = .1;
  f.engine.click();
  assert.equal(f.context.named('click').length, 2);
  assert.equal(f.context.named('click')[0].stops.length, 1);

  f.engine.update(snapshot({ step: 3, phase: 'action', count: 0 }));
  f.engine.update(snapshot({ step: 3, phase: 'action', count: 1 }));
  const [old, replacement] = f.context.named('knead');
  assert.equal(old.stops.length, 1);
  old.finish();
  assert.equal(old.disconnected, true);
  f.engine.update(snapshot({ step: 3, phase: 'action', count: 2 }));
  assert.equal(replacement.stops.length, 1, 'old onended must not delete the replacement group');
  for (let count = 3; count < 30; count += 1) f.engine.update(snapshot({ step: 3, phase: 'action', count }));
  assert.equal(f.context.named('knead').filter((source) => source.stops.length === 0).length, 1);
  assert.equal(f.context.named('music').length, 1);
  f.engine.destroy();
});

for (const cause of ['hidden', 'modal']) {
  test(`${cause} pause mutes audio, stops transient voices and steam, then resumes one music loop`, async () => {
    const f = fixture();
    await f.engine.unlock();
    f.engine.update(snapshot({ step: 7, phase: 'ready', progress: 1 }));
    f.engine.click();
    const steam = f.context.named('steam')[0];
    const click = f.context.named('click')[0];
    const state = snapshot({ step: 7, phase: 'ready', progress: 1, paused: cause === 'modal' });
    if (cause === 'hidden') f.engine.setHidden(true);
    else f.engine.update(state);
    assert.equal(f.context.gains[0].gain.value, 0);
    assert.equal(steam.stops.length, 1);
    assert.equal(click.stops.length, 1);
    assert.equal(f.timers.size, 1);
    f.engine.update(state);
    assert.equal(f.timers.size, 1, 'paused frames should not schedule extra suspension timers');
    f.runTimers();
    await flushPromises();
    assert.equal(f.context.suspendCalls, 1);
    const sourceCount = f.context.sources.length;
    f.engine.click();
    assert.equal(f.context.sources.length, sourceCount);
    if (cause === 'hidden') f.engine.setHidden(false);
    else f.engine.update({ ...state, paused: false });
    await flushPromises();
    assert.equal(f.context.state, 'running');
    assert.equal(f.context.named('music').length, 1);
    assert.equal(f.context.named('steam').length, 2);
    assert.equal(f.context.named('click').length, 1, 'paused effects must not replay after resuming');
    f.engine.destroy();
  });
}

test('resuming before the pause fade finishes cancels the pending suspension', async () => {
  const f = fixture();
  await f.engine.unlock();
  f.engine.setHidden(true);
  assert.equal(f.timers.size, 1);
  f.engine.setHidden(false);
  assert.equal(f.timers.size, 0);
  f.runTimers();
  assert.equal(f.context.suspendCalls, 0);
  assert.equal(f.context.named('music').length, 1);
  f.engine.destroy();
});

for (const cause of ['hidden', 'modal']) {
  test(`a late suspend completion resumes audio after the ${cause} pause has already ended`, async () => {
    const f = fixture();
    await f.engine.unlock();
    let finishSuspend;
    f.context.suspendBehavior = () => new Promise((resolve) => {
      finishSuspend = () => { f.context.transition('suspended'); resolve(); };
    });
    const pause = (value) => cause === 'hidden'
      ? f.engine.setHidden(value)
      : f.engine.update(snapshot({ paused: value }));
    pause(true);
    f.runTimers();
    assert.equal(f.context.suspendCalls, 1);
    assert.equal(f.context.state, 'running', 'the suspend request has not settled yet');

    pause(false);
    await flushPromises();
    assert.equal(f.context.state, 'running');
    assert.equal(f.context.resumeCalls, 1, 'the context still appears to be running');
    finishSuspend();
    await flushPromises();
    assert.equal(f.context.state, 'running', 'late suspension must not leave the unpaused game silent');
    assert.equal(f.context.resumeCalls, 2);
    assert.equal(f.context.named('music').length, 1, 'recovery must reuse the existing music loop');
    f.engine.destroy();
  });
}

test('synchronous resume failures are contained for gestures, visibility and modal recovery', async () => {
  const f = fixture();
  await f.engine.unlock();
  f.context.transition('interrupted');
  f.context.resumeBehavior = () => { throw new Error('resume failed synchronously'); };
  assert.equal(await f.engine.unlock(), false);
  assert.doesNotThrow(() => f.engine.setHidden(false));
  f.engine.update(snapshot({ paused: true }));
  assert.doesNotThrow(() => f.engine.update(snapshot({ paused: false })));
  await flushPromises();
  assert.equal(f.context.named('music').length, 1);
  f.context.resumeBehavior = undefined;
  assert.equal(await f.engine.unlock(), true, 'a failed resume must not prevent a later gesture');
  f.engine.destroy();
});

test('a synchronous suspend failure cannot escape the pause timer', async () => {
  const f = fixture();
  await f.engine.unlock();
  f.context.suspendBehavior = () => { throw new Error('suspend failed synchronously'); };
  f.engine.setHidden(true);
  assert.doesNotThrow(() => f.runTimers());
  await flushPromises();
  assert.equal(f.context.suspendCalls, 1);
  assert.equal(f.context.gains[0].gain.value, 0, 'master gain still silences a context that cannot suspend');
  assert.doesNotThrow(() => f.engine.setHidden(false));
  assert.equal(f.context.named('music').length, 1);
  f.engine.destroy();
});

test('a synchronous close failure cannot escape cleanup or repeat on a second cleanup', async () => {
  const f = fixture();
  await f.engine.unlock();
  f.context.closeBehavior = () => { throw new Error('close failed synchronously'); };
  assert.doesNotThrow(() => f.engine.destroy());
  assert.doesNotThrow(() => f.engine.destroy());
  await flushPromises();
  assert.equal(f.context.closeCalls, 1);
  assert.equal(await f.engine.unlock(), false);
  assert.equal(f.context.onstatechange, null);
});

test('rejected resumes, suspension and closure are contained without unhandled rejections', async () => {
  const f = fixture();
  f.context.resumeBehavior = () => Promise.reject(new Error('gesture denied'));
  assert.equal(await f.engine.unlock(), false);
  assert.equal(f.context.named('music').length, 0);
  f.engine.update(snapshot({ step: 1, phase: 'action' }));
  await flushPromises();
  f.engine.setHidden(false);
  await flushPromises();
  f.context.resumeBehavior = undefined;
  assert.equal(await f.engine.unlock(), true);
  f.context.suspendBehavior = () => Promise.reject(new Error('suspension unavailable'));
  f.engine.setHidden(true);
  f.runTimers();
  await flushPromises();
  f.context.closeBehavior = () => Promise.reject(new Error('closure unavailable'));
  assert.doesNotThrow(() => f.engine.destroy());
  await flushPromises();
  assert.equal(f.context.closeCalls, 1);
});

test('disposing during a pending resume prevents late playback and is idempotent', async () => {
  const f = fixture();
  let resolveResume;
  f.context.resumeBehavior = () => new Promise((resolve) => { resolveResume = resolve; });
  const pending = f.engine.unlock();
  f.engine.destroy();
  f.engine.destroy();
  f.context.state = 'running';
  resolveResume();
  assert.equal(await pending, false);
  assert.equal(await f.engine.unlock(), false);
  f.engine.update(snapshot({ step: 9, phase: 'done' }));
  f.engine.click();
  f.engine.setHidden(false);
  assert.equal(f.context.named('music').length, 0);
  assert.equal(f.context.named('celebrate').length, 0);
  assert.equal(f.context.closeCalls, 1);
  assert.equal(f.context.onstatechange, null);
});

test('destroy cancels pause timers and stops every retained voice', async () => {
  const f = fixture();
  await f.engine.unlock();
  f.engine.update(snapshot({ step: 7, phase: 'ready', progress: 1 }));
  f.engine.click();
  f.engine.setHidden(true);
  f.engine.destroy();
  assert.equal(f.timers.size, 0);
  f.runTimers();
  assert.equal(f.context.suspendCalls, 0);
  for (const source of f.context.sources.filter((item) => item.buffer?.name)) {
    assert.equal(source.stops.length, 1, `${source.buffer.name} should stop exactly once`);
  }
});

test('unsupported audio or a failing context factory leaves frozen game snapshots untouched', async () => {
  for (const contextFactory of [() => null, () => { throw new Error('audio unavailable'); }]) {
    const f = fixture({ contextFactory });
    const state = Object.freeze(snapshot({ step: 3, phase: 'action', count: 1 }));
    assert.equal(await f.engine.unlock(), false);
    assert.doesNotThrow(() => {
      f.engine.update(state);
      f.engine.click();
      f.engine.setHidden(true);
      f.engine.setHidden(false);
      f.engine.destroy();
    });
    assert.deepEqual(state, snapshot({ step: 3, phase: 'action', count: 1 }));
  }
});

// Isolate the hook's event/effect contract without adding a DOM implementation
// or React renderer dependency. The real hook body runs with supplied hooks;
// replaying its effects models React StrictMode's setup/cleanup/setup cycle.
function hookFixture() {
  const effects = [];
  const engines = [];
  class EventSurface {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener, capture) {
      const entries = this.listeners.get(type) || [];
      entries.push({ listener, capture });
      this.listeners.set(type, entries);
    }
    removeEventListener(type, listener, capture) {
      this.listeners.set(type, (this.listeners.get(type) || []).filter(
        (entry) => entry.listener !== listener || entry.capture !== capture));
    }
    fire(type, event = {}) {
      for (const { listener } of [...(this.listeners.get(type) || [])]) listener({ type, ...event });
    }
    count() { return [...this.listeners.values()].reduce((sum, entries) => sum + entries.length, 0); }
  }
  class ElementMock {
    constructor({ inGame = true, button = null } = {}) { this.inGame = inGame; this.button = button; }
    closest(selector) { return selector === 'button' ? this.button : this.inGame ? this : null; }
  }
  const document = Object.assign(new EventSurface(), { hidden: false });
  const window = new EventSurface();
  const source = readFileSync(new URL('../../src/audio/useGameAudio.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace('export function useGameAudio', 'function useGameAudio');
  const useGameAudio = runInNewContext(`${source}\nuseGameAudio;`, {
    useRef: (value) => ({ current: value }),
    useEffect: (setup) => effects.push(setup),
    createAudioEngine: () => {
      const engine = { updates: [], visibility: [], unlocks: 0, clicks: 0, destroyed: false,
        update(state) { this.updates.push(state); },
        setHidden(value) { this.visibility.push(value); },
        unlock() { this.unlocks += 1; return Promise.resolve(!this.destroyed); },
        click() { if (!this.destroyed) this.clicks += 1; },
        destroy() { this.destroyed = true; } };
      engines.push(engine);
      return engine;
    },
    document, window, Element: ElementMock,
  });
  useGameAudio(snapshot());
  return { document, window, engines, ElementMock,
    setup() {
      const cleanups = effects.map((setup) => setup());
      return () => cleanups.forEach((cleanup) => cleanup?.());
    } };
}

test('hook accepts only trusted game gestures and active buttons, including keyboard activation', async () => {
  const f = hookFixture();
  const cleanup = f.setup();
  const engine = f.engines[0];
  const target = new f.ElementMock({ button: { disabled: false } });
  f.document.fire('pointerup', { target, isTrusted: false });
  f.document.fire('pointerup', { target: new f.ElementMock({ inGame: false }), isTrusted: true });
  f.document.fire('keydown', { target, isTrusted: true, key: 'a' });
  f.document.fire('keydown', { target, isTrusted: true, key: 'Enter', repeat: true });
  f.document.fire('click', { target: new f.ElementMock({ button: { disabled: true } }), isTrusted: true });
  f.document.fire('click', { target: new f.ElementMock(), isTrusted: true });
  f.document.fire('click', { target, isTrusted: false });
  assert.equal(engine.unlocks, 0);
  f.document.fire('pointerup', { target, isTrusted: true });
  f.document.fire('keydown', { target, isTrusted: true, key: 'Enter', repeat: false });
  f.document.fire('keydown', { target, isTrusted: true, key: ' ', repeat: false });
  f.document.fire('click', { target, isTrusted: true });
  await flushPromises();
  assert.equal(engine.unlocks, 4);
  assert.equal(engine.clicks, 1);
  cleanup();
});

test('hook StrictMode cleanup removes every listener and creates a fresh engine on effect replay', async () => {
  const f = hookFixture();
  const firstCleanup = f.setup();
  const first = f.engines[0];
  assert.equal(f.document.count(), 4);
  assert.equal(f.window.count(), 2);
  f.document.hidden = true;
  f.document.fire('visibilitychange');
  f.window.fire('pagehide');
  f.document.hidden = false;
  f.window.fire('pageshow');
  assert.deepEqual(first.visibility, [false, true, true, false]);
  firstCleanup();
  assert.equal(first.destroyed, true);
  assert.equal(f.document.count(), 0);
  assert.equal(f.window.count(), 0);

  const secondCleanup = f.setup();
  const second = f.engines[1];
  assert.notEqual(first, second);
  assert.equal(f.document.count(), 4);
  assert.equal(f.window.count(), 2);
  f.document.fire('click', { target: new f.ElementMock({ button: { disabled: false } }), isTrusted: true });
  await flushPromises();
  assert.equal(first.unlocks, 0);
  assert.equal(second.unlocks, 1);
  assert.equal(second.clicks, 1);
  secondCleanup();
  assert.equal(second.destroyed, true);
  assert.equal(f.document.count() + f.window.count(), 0);
});
