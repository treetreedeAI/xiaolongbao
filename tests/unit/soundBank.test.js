import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
const durations = { music: 20, click: 0.11, water: 1.2, flour: 0.76, knead: 0.34,
  fold: 0.33, place: 0.3, steam: 3, tick: 0.16, tickFinal: 0.28, celebrate: 1.8 };

function digest(buffer) {
  const hash = createHash('sha256');
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }
  return hash.digest('hex');
}

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
