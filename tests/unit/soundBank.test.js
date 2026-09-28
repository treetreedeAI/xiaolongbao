import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSoundBank } from '../../src/audio/soundBank.js';

function context(sampleRate = 48000) {
  return {
    sampleRate,
    buffersCreated: 0,
    createBuffer(numberOfChannels, length, rate) {
      this.buffersCreated += 1;
      const data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return { numberOfChannels, length, sampleRate: rate, duration: length / rate,
        getChannelData: (index) => data[index] };
    },
  };
}

const firstContext = context();
const bank = createSoundBank(firstContext);
const durations = { music: 20, click: 0.11, water: 1.3, flour: 1, knead: 0.34,
  fold: 0.33, place: 0.3, ignition: 0.8, steam: 3, tick: 0.16, tickFinal: 0.28, celebrate: 4.2 };

// Music/click/steam/ticks retain their original published PCM. Knead and
// ignition retain the accepted first-pass revision. The second-pass request
// only changes flour, water, place, fold and the voice-free finale.
const preservedDigests = {
  music: '0786240a1022e0154f88bfbc98af2da794c8d5f9c10a17fde3779dd84eb3af89',
  click: 'cdeb179fd445a168ea81eaf886b8323de88095d2c482d67d4920f94d58186e2d',
  knead: '7566c411245d20046de0aef1368502043b813b22eeb4bd490aced9dec61f87b2',
  ignition: 'de4291346f4bfb66bd532fef99065a610df839b8c166b5268383ee4a3fdb01cc',
  steam: '1e08f9009d1fba2633799c31135a7924af19efe4f213e93e2ed2aa317fe36c4c',
  tick: '33a2ccf12eb4bd4e22316233ef6acdf833b1da452b22471a1f6d44eb87ee0db0',
  tickFinal: '5cb7faa24e9f649da4ca984ed08f3e5884fcb22f310bc122038138fe46159c21',
};

function digest(buffer) {
  const hash = createHash('sha256');
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }
  return hash.digest('hex');
}

test('background music and every unrequested sound remain byte-exactly unchanged', () => {
  for (const [name, expected] of Object.entries(preservedDigests)) {
    assert.equal(digest(bank[name]), expected, `${name}: changed outside the requested revision`);
  }
});

test('the voice-free finale has no recorded voice, sampled celebration or speech dependency', () => {
  const source = readFileSync(new URL('../../src/audio/soundBank.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /recordedCelebration|mixRecordedCelebration|WOW_SoundSmith|speechSynthesis/);
  assert.doesNotMatch(source, /^\s*import\s/m, 'the procedural bank must not import recorded media');
  assert.equal(bank.celebrate.duration, 4.2);
  let lateEnergy = 0;
  let sampleCount = 0;
  for (let channel = 0; channel < bank.celebrate.numberOfChannels; channel += 1) {
    const data = bank.celebrate.getChannelData(channel);
    for (let index = Math.round(3 * bank.celebrate.sampleRate); index < data.length; index += 1) {
      lateEnergy += data[index] ** 2;
      sampleCount += 1;
    }
  }
  assert(Math.sqrt(lateEnergy / sampleCount) > 0.005, 'the longer finale must contain sound, not a padded silent tail');
});

test('bank exposes every named gesture at usable durations and a compact source rate', () => {
  assert.deepEqual(Object.keys(bank).sort(), Object.keys(durations).sort());
  for (const [name, buffer] of Object.entries(bank)) {
    assert.equal(buffer.sampleRate, 22050, name);
    assert(Math.abs(buffer.duration - durations[name]) <= 1 / buffer.sampleRate, name);
    assert.equal(buffer.numberOfChannels, ['music', 'celebrate'].includes(name) ? 2 : 1, name);
  }
});

test('every PCM sample is finite with audible energy and at least 20% headroom', () => {
  for (const [name, buffer] of Object.entries(bank)) {
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      let energy = 0;
      let mean = 0;
      for (const value of data) {
        assert(Number.isFinite(value), `${name}: non-finite PCM`);
        assert(Math.abs(value) <= 0.8, `${name}: clipping risk`);
        energy += value * value;
        mean += value;
      }
      assert(Math.sqrt(energy / data.length) > 0.005, `${name}: effectively silent`);
      assert(Math.abs(mean / data.length) < 0.002, `${name}: excessive DC offset`);
    }
  }
});

test('one-shots start and end at zero, without hard envelope edges', () => {
  for (const [name, buffer] of Object.entries(bank)) {
    if (name === 'music' || name === 'steam') continue;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      assert.equal(data[0], 0, `${name}: first sample`);
      assert.equal(data[data.length - 1], 0, `${name}: last sample`);
      assert(Math.abs(data[1]) < 0.001, `${name}: abrupt attack`);
      assert(Math.abs(data[data.length - 2]) < 0.001, `${name}: abrupt release`);
    }
  }
});

test('music and steam loop boundaries match without inserting a silent join', () => {
  for (const name of ['music', 'steam']) {
    const buffer = bank[name];
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      assert.equal(data[0], data[data.length - 1], `${name}: loop discontinuity`);
      const window = Math.round(buffer.sampleRate * 0.025);
      let seamEnergy = 0;
      for (let index = 0; index < window; index += 1) {
        seamEnergy += data[index] ** 2 + data[data.length - 1 - index] ** 2;
      }
      assert(Math.sqrt(seamEnergy / (2 * window)) > 0.001, `${name}: silent loop gap`);
    }
  }
});

test('original synthesis is deterministic across contexts and hardware sample rates', () => {
  const second = createSoundBank(context(44100));
  for (const name of Object.keys(bank)) assert.equal(digest(bank[name]), digest(second[name]), name);
  assert.notDeepEqual(bank.music.getChannelData(0), bank.music.getChannelData(1), 'music should retain its stereo placement');
});

test('reusing a context returns the cached bank without allocating audio buffers again', () => {
  const count = firstContext.buffersCreated;
  assert.equal(createSoundBank(firstContext), bank);
  assert.equal(firstContext.buffersCreated, count);
  assert(Object.isFrozen(bank));
  assert.throws(() => createSoundBank(null), TypeError);
  assert.throws(() => createSoundBank({}), TypeError);
});
