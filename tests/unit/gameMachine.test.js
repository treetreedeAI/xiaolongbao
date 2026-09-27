import test from 'node:test';
import assert from 'node:assert/strict';
import { createBunGameMachine, GAME_TIMINGS } from '../../src/gameMachine.js';

function finishEntry(game) {
  assert.equal(game.getSnapshot().phase, 'entering');
  game.advance(game.getSnapshot().reducedMotion ? GAME_TIMINGS.reducedEntering : GAME_TIMINGS.entering);
}

function finishStep(game) {
  const { step, reducedMotion } = game.getSnapshot();
  if (game.getSnapshot().entering) finishEntry(game);
  if (step === 8) {
    game.advance(GAME_TIMINGS.countdown);
  } else {
    const repeat = step === 3 || step === 5;
    for (let index = 0; index < (repeat ? 3 : 1); index += 1) {
      assert.equal(game.act(), true);
      game.advance(reducedMotion ? GAME_TIMINGS.reducedAction
        : step === 7 ? GAME_TIMINGS.steaming
          : repeat ? GAME_TIMINGS.repetition : GAME_TIMINGS.action);
    }
    game.advance(reducedMotion ? GAME_TIMINGS.reducedSettling : GAME_TIMINGS.settling);
  }
  assert.equal(game.getSnapshot().step, step);
  assert.equal(game.getSnapshot().ready, true);
  assert.equal(game.getSnapshot().busy, false);
}

function enterStep(target, options) {
  const game = createBunGameMachine(options);
  game.begin();
  while (game.getSnapshot().step < target) {
    finishStep(game);
    assert.equal(game.next(), true);
  }
  if (target < 9) finishEntry(game);
  return game;
}

test('cover starts once; entry, action and settling synchronously block repeated activation', () => {
  const game = createBunGameMachine();
  assert.equal(game.act(), false);
  assert.equal(game.next(), false);
  assert.equal(game.begin(), true);
  assert.equal(game.begin(), false);
  assert.equal(game.getSnapshot().entering, true);
  assert.equal(game.getSnapshot().busy, true);
  assert.equal(game.act(), false);
  game.advance(419);
  assert.equal(game.getSnapshot().phase, 'entering');
  game.advance(1);
  assert.equal(game.act(), true);
  for (let index = 0; index < 20; index += 1) assert.equal(game.act(), false);
  game.advance(899);
  assert.equal(game.getSnapshot().phase, 'action');
  game.advance(1);
  assert.equal(game.getSnapshot().phase, 'settling');
  assert.equal(game.act(), false);
  assert.equal(game.next(), false);
  game.advance(449);
  assert.equal(game.getSnapshot().ready, false);
  game.advance(1);
  assert.equal(game.getSnapshot().step, 1);
  assert.equal(game.getSnapshot().phase, 'ready');
  assert.equal(game.act(), false);
});

test('every step waits for next; next changes the step immediately and cannot skip screens', () => {
  const game = enterStep(1);
  for (let step = 1; step <= 8; step += 1) {
    finishStep(game);
    game.advance(60000);
    assert.equal(game.getSnapshot().step, step);
    assert.equal(game.next(), true);
    assert.equal(game.getSnapshot().step, step + 1);
    for (let index = 0; index < 20; index += 1) assert.equal(game.next(), false);
    if (step < 8) {
      assert.equal(game.getSnapshot().phase, 'entering');
      finishEntry(game);
    }
  }
  assert.equal(game.getSnapshot().phase, 'done');
  assert.equal(game.getSnapshot().step, 9);
  assert.equal(game.getSnapshot().busy, false);
});

for (const step of [3, 5]) {
  test(`step ${step} requires three separate completed actions before next is enabled`, () => {
    const game = enterStep(step);
    for (let index = 1; index <= 3; index += 1) {
      assert.equal(game.act(), true);
      assert.equal(game.act(), false);
      game.advance(GAME_TIMINGS.repetition);
      assert.equal(game.getSnapshot().count, index);
      assert.equal(game.getSnapshot().step, step);
      assert.equal(game.getSnapshot().phase, index < 3 ? 'idle' : 'settling');
      assert.equal(game.next(), false);
    }
    game.advance(GAME_TIMINGS.settling);
    assert.equal(game.getSnapshot().step, step);
    assert.equal(game.getSnapshot().ready, true);
    assert.equal(game.next(), true);
    assert.equal(game.getSnapshot().step, step + 1);
    assert.equal(game.getSnapshot().count, 0);
  });
}

test('timer entry displays 5 for 420ms before five complete seconds begin', () => {
  const game = enterStep(7);
  finishStep(game);
  game.next();
  assert.equal(game.getSnapshot().step, 8);
  assert.equal(game.getSnapshot().phase, 'entering');
  assert.equal(game.getSnapshot().countdown, 5);
  assert.equal(game.getSnapshot().countdownProgress, 0);
  game.advance(419);
  assert.equal(game.getSnapshot().phase, 'entering');
  assert.equal(game.getSnapshot().countdown, 5);
  assert.equal(game.getSnapshot().countdownProgress, 0);
  game.advance(1);
  assert.equal(game.getSnapshot().phase, 'countdown');
  assert.equal(game.getSnapshot().countdown, 5);

  for (let digit = 5; digit >= 1; digit -= 1) {
    assert.equal(game.getSnapshot().countdown, digit);
    assert.equal(game.getSnapshot().ready, false);
    assert.equal(game.next(), false);
    game.advance(999);
    assert.equal(game.getSnapshot().countdown, digit);
    assert.equal(game.getSnapshot().ready, false);
    game.advance(1);
  }
  assert.equal(game.getSnapshot().step, 8);
  assert.equal(game.getSnapshot().phase, 'ready');
  assert.equal(game.getSnapshot().countdown, 1);
  assert.equal(game.getSnapshot().countdownProgress, 1);
  game.advance(60000);
  assert.equal(game.getSnapshot().countdown, 1);
  assert.equal(game.getSnapshot().step, 8);
  game.next();
  assert.equal(game.getSnapshot().step, 9);
  assert.equal(game.getSnapshot().phase, 'done');
  assert.equal(game.getSnapshot().countdown, 1);
});

test('step 7 stays locked for its complete 4800ms action and still requires explicit Next', () => {
  const game = enterStep(7);
  assert.equal(GAME_TIMINGS.steaming, 4800);
  assert.equal(game.act(), true);
  for (const elapsed of [900, 3899]) {
    game.advance(elapsed);
    assert.equal(game.getSnapshot().step, 7);
    assert.equal(game.getSnapshot().phase, 'action');
    assert.equal(game.getSnapshot().count, 0);
    assert.equal(game.getSnapshot().busy, true);
    assert.equal(game.getSnapshot().ready, false);
    for (let index = 0; index < 20; index += 1) assert.equal(game.act(), false);
    assert.equal(game.next(), false);
  }
  game.advance(1);
  assert.equal(game.getSnapshot().phase, 'settling');
  assert.equal(game.getSnapshot().count, 1);
  assert.equal(game.getSnapshot().progress, 1);
  assert.equal(game.act(), false);
  assert.equal(game.next(), false);
  game.advance(GAME_TIMINGS.settling - 1);
  assert.equal(game.getSnapshot().ready, false);
  game.advance(1);
  assert.equal(game.getSnapshot().ready, true);
  assert.equal(game.getSnapshot().step, 7);
  game.advance(60000);
  assert.equal(game.getSnapshot().step, 7);
  assert.equal(game.next(), true);
  assert.equal(game.getSnapshot().step, 8);
  assert.equal(game.getSnapshot().phase, 'entering');
});

test('step 7 pauses its longer action and resumes only the remaining active time', () => {
  const game = enterStep(7);
  game.tick(0);
  game.act(0);
  game.tick(1600);
  assert.equal(game.getSnapshot().progress, 1 / 3);
  game.setPaused(true, 1600);
  game.tick(61600);
  assert.equal(game.getSnapshot().phase, 'action');
  assert.equal(game.getSnapshot().progress, 1 / 3);
  assert.equal(game.act(61600), false);
  assert.equal(game.next(61600), false);
  game.setPaused(false, 61600);
  game.tick(64799);
  assert.equal(game.getSnapshot().phase, 'action');
  assert.equal(game.getSnapshot().count, 0);
  game.tick(64800);
  assert.equal(game.getSnapshot().phase, 'settling');
  assert.equal(game.getSnapshot().count, 1);
  game.tick(64800 + GAME_TIMINGS.settling);
  assert.equal(game.getSnapshot().ready, true);
  assert.equal(game.getSnapshot().step, 7);
});

test('step 7 keeps the existing 120ms reduced-motion action', () => {
  const game = enterStep(7, { reducedMotion: true });
  assert.equal(game.act(), true);
  game.advance(119);
  assert.equal(game.getSnapshot().phase, 'action');
  assert.equal(game.getSnapshot().ready, false);
  game.advance(1);
  assert.equal(game.getSnapshot().phase, 'settling');
  game.advance(GAME_TIMINGS.reducedSettling);
  assert.equal(game.getSnapshot().ready, true);
  assert.equal(game.getSnapshot().step, 7);
});

test('step 7 motion preference changes preserve progress in both duration directions', () => {
  const game = enterStep(7);
  game.act();
  game.advance(1200);
  assert.equal(game.getSnapshot().progress, .25);
  game.setReducedMotion(true);
  assert.equal(game.getSnapshot().progress, .25);
  game.advance(30);
  assert.equal(game.getSnapshot().progress, .5);
  game.setReducedMotion(false);
  assert.equal(game.getSnapshot().progress, .5);
  game.advance(2399);
  assert.equal(game.getSnapshot().phase, 'action');
  game.advance(1);
  assert.equal(game.getSnapshot().phase, 'settling');
  assert.equal(game.getSnapshot().progress, 1);
});

test('background or modal pauses entry and resumes only its remaining active time', () => {
  const game = createBunGameMachine();
  game.begin(0);
  game.tick(100);
  assert.equal(game.getSnapshot().progress, 100 / 420);
  game.setPaused(true, 100);
  game.tick(60100);
  assert.equal(game.getSnapshot().phase, 'entering');
  assert.equal(game.getSnapshot().progress, 100 / 420);
  game.setPaused(false, 60100);
  game.tick(60419);
  assert.equal(game.getSnapshot().phase, 'entering');
  game.tick(60420);
  assert.equal(game.getSnapshot().phase, 'idle');
  assert.equal(game.getSnapshot().progress, 0);
});

test('background or modal pauses action, settling and ready-state navigation', () => {
  const game = enterStep(1);
  game.tick(0);
  game.act(0);
  game.tick(300);
  game.setPaused(true, 300);
  const progress = game.getSnapshot().progress;
  game.tick(60300);
  assert.equal(game.getSnapshot().progress, progress);
  assert.equal(game.act(60300), false);
  game.setPaused(false, 60300);
  game.tick(60899);
  assert.equal(game.getSnapshot().phase, 'action');
  game.tick(60900);
  assert.equal(game.getSnapshot().phase, 'settling');
  game.setPaused(true, 61000);
  game.setPaused(false, 71000);
  game.tick(71349);
  assert.equal(game.getSnapshot().phase, 'settling');
  game.tick(71350);
  assert.equal(game.getSnapshot().ready, true);
  game.setPaused(true, 71350);
  assert.equal(game.next(), false);
  game.setPaused(false, 71350);
  assert.equal(game.next(), true);
});

test('countdown resumes after backgrounding and never includes paused time', () => {
  const game = enterStep(8);
  game.tick(0);
  game.tick(1700);
  game.setPaused(true, 1700);
  game.setPaused(false, 101700);
  assert.equal(game.getSnapshot().countdown, 4);
  game.tick(104999);
  assert.equal(game.getSnapshot().phase, 'countdown');
  assert.equal(game.getSnapshot().ready, false);
  game.tick(105000);
  assert.equal(game.getSnapshot().step, 8);
  assert.equal(game.getSnapshot().phase, 'ready');
  assert.equal(game.getSnapshot().countdown, 1);
});

for (const initialStep of [1, 5, 8, 9]) {
  test(`replay from step ${initialStep} clears progress and timers and returns to the cover`, () => {
    const game = enterStep(initialStep);
    if (initialStep < 8) game.act();
    game.advance(200);
    game.replay();
    assert.deepEqual(
      Object.fromEntries(['step', 'phase', 'count', 'progress', 'countdown', 'countdownProgress', 'ready', 'entering'].map((key) => [key, game.getSnapshot()[key]])),
      { step: 0, phase: 'idle', count: 0, progress: 0, countdown: 5, countdownProgress: 0, ready: false, entering: false },
    );
    game.advance(100000);
    assert.equal(game.getSnapshot().step, 0);
    assert.equal(game.act(), false);
    assert.equal(game.next(), false);
    assert.equal(game.begin(), true);
    finishEntry(game);
    assert.equal(game.getSnapshot().phase, 'idle');
    assert.equal(game.getSnapshot().step, 1);
    game.goHome();
    assert.equal(game.getSnapshot().step, 0);
  });
}

test('reduced motion shortens entry/action/settling, never the full five-second timer', () => {
  const game = enterStep(7, { reducedMotion: true });
  finishStep(game);
  game.next();
  game.advance(119);
  assert.equal(game.getSnapshot().phase, 'entering');
  assert.equal(game.getSnapshot().countdown, 5);
  game.advance(1);
  assert.equal(game.getSnapshot().phase, 'countdown');
  game.advance(4999);
  assert.equal(game.getSnapshot().ready, false);
  assert.equal(game.getSnapshot().countdown, 1);
  game.advance(1);
  assert.equal(game.getSnapshot().ready, true);
  assert.equal(game.getSnapshot().step, 8);
});

test('a late entry frame starts five fresh seconds without charging transition overshoot', () => {
  const game = enterStep(7);
  game.act();
  game.advance(60000);
  assert.equal(game.getSnapshot().step, 7);
  assert.equal(game.getSnapshot().phase, 'ready');
  game.next(0);
  const countdownStart = GAME_TIMINGS.entering + 1500;
  game.tick(countdownStart);
  assert.equal(game.getSnapshot().step, 8);
  assert.equal(game.getSnapshot().phase, 'countdown');
  assert.equal(game.getSnapshot().countdown, 5);
  assert.equal(game.getSnapshot().countdownProgress, 0);
  game.tick(countdownStart + 999);
  assert.equal(game.getSnapshot().countdown, 5);
  game.tick(countdownStart + 1000);
  assert.equal(game.getSnapshot().countdown, 4);
  game.tick(countdownStart + 4999);
  assert.equal(game.getSnapshot().ready, false);
  game.tick(countdownStart + 5000);
  assert.equal(game.getSnapshot().ready, true);
  assert.equal(game.getSnapshot().step, 8);
  assert.equal(game.getSnapshot().countdown, 1);
  assert.equal(game.getSnapshot().countdownProgress, 1);
});

test('snapshots stay stable when idle and stale timestamps never double-count time', () => {
  const game = createBunGameMachine();
  const first = game.getSnapshot();
  game.tick(0);
  game.tick(1000);
  assert.equal(game.getSnapshot(), first);
  game.begin(1000);
  game.tick(1420);
  game.act(1420);
  game.tick(1620);
  game.tick(1520);
  game.tick(1620);
  assert.equal(game.getSnapshot().progress, 200 / 900);
});

test('motion preference changes preserve fractional entry and action progress', () => {
  const game = createBunGameMachine();
  game.begin();
  game.advance(210);
  game.setReducedMotion(true);
  game.advance(59);
  assert.equal(game.getSnapshot().phase, 'entering');
  game.advance(1);
  assert.equal(game.getSnapshot().phase, 'idle');
  game.setReducedMotion(false);
  game.act();
  game.advance(450);
  game.setReducedMotion(true);
  assert.equal(game.getSnapshot().progress, 0.5);
  game.advance(59);
  assert.equal(game.getSnapshot().phase, 'action');
  game.advance(1);
  assert.equal(game.getSnapshot().phase, 'settling');
});
