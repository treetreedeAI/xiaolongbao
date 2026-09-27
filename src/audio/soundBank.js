// Original procedural composition and sound design; no recordings or samples.
// A modest source rate keeps first-gesture work small. Web Audio resamples these
// buffers to the device rate, so they do not depend on context.sampleRate.
const RATE = 22050;
const TAU = Math.PI * 2;
const banks = new WeakMap();

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  };
}

function empty(context, seconds, channels = 1) {
  return context.createBuffer(channels, Math.round(seconds * RATE), RATE);
}

function channels(buffer) {
  return Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
}

function smooth(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function envelope(time, duration, attack = 0.02, release = 0.06) {
  return smooth(time / attack) * smooth((duration - time) / release);
}

// Damped, slightly inharmonic modes model a struck tine/wooden bar. Oscillator
// recurrence avoids doing several trigonometric calls for every PCM frame.
function mallet(buffer, start, frequency, duration, level, pan = 0, wood = false, loop = false) {
  const data = channels(buffer);
  const gains = data.length === 1 ? [level] : [
    level * Math.cos((pan + 1) * Math.PI / 4),
    level * Math.sin((pan + 1) * Math.PI / 4),
  ];
  const ratios = wood ? [1, 2.01, 3.97] : [1, 2.76, 5.4];
  const weights = wood ? [1, 0.15, 0.025] : [1, 0.12, 0.025];
  const oscillators = ratios.map((ratio, index) => {
    const angle = TAU * frequency * ratio / RATE;
    return { sine: 0, cosine: 1, stepSin: Math.sin(angle), stepCos: Math.cos(angle),
      amplitude: weights[index], decay: Math.exp(-(5 + index * 4) / (duration * RATE)) };
  });
  const noise = random(0x5168 + Math.round(frequency * 17 + start * RATE));
  const frames = Math.round(duration * RATE);
  const attack = Math.round((wood ? 0.007 : 0.004) * RATE);
  const release = Math.round(0.025 * RATE);
  let target = Math.round(start * RATE);
  let contact = 0.018;
  const contactDecay = Math.exp(-1 / (0.006 * RATE));
  for (let index = 0; index < frames; index += 1, target += 1) {
    if (target >= buffer.length) {
      if (!loop) break;
      target -= buffer.length;
    }
    let value = noise() * contact;
    contact *= contactDecay;
    for (const mode of oscillators) {
      value += mode.sine * mode.amplitude;
      const sine = mode.sine * mode.stepCos + mode.cosine * mode.stepSin;
      mode.cosine = mode.cosine * mode.stepCos - mode.sine * mode.stepSin;
      mode.sine = sine;
      mode.amplitude *= mode.decay;
    }
    value *= smooth(index / attack) * smooth((frames - 1 - index) / release);
    for (let channel = 0; channel < data.length; channel += 1) data[channel][target] += value * gains[channel];
  }
}

// Difference of two low-pass filters gives soft, bounded noise bands rather
// than raw white-noise hiss. Each gesture shapes that texture independently.
function texture(buffer, start, duration, level, lowCut, highCut, seed, shape) {
  const out = buffer.getChannelData(0);
  const noise = random(seed);
  const slowCoefficient = 1 - Math.exp(-TAU * lowCut / RATE);
  const fastCoefficient = 1 - Math.exp(-TAU * highCut / RATE);
  const startFrame = Math.round(start * RATE);
  const count = Math.min(Math.round(duration * RATE), out.length - startFrame);
  let slow = 0;
  let fast = 0;
  for (let index = 0; index < count; index += 1) {
    const white = noise();
    slow += slowCoefficient * (white - slow);
    fast += fastCoefficient * (white - fast);
    out[startFrame + index] += (fast - slow) * level * shape(index / RATE, duration);
  }
}

function bubble(buffer, start, frequency, level) {
  const out = buffer.getChannelData(0);
  const frames = Math.round(0.07 * RATE);
  const offset = Math.round(start * RATE);
  let phase = 0;
  for (let index = 0; index < frames && offset + index < out.length; index += 1) {
    const time = index / RATE;
    // Small rising surface bubbles, without low, gulping vocal-like resonances.
    phase += TAU * frequency * (1 + 0.32 * index / frames) / RATE;
    out[offset + index] += Math.sin(phase) * Math.exp(-time * 65)
      * envelope(time, frames / RATE, 0.005, 0.014) * level;
  }
}

function finish(buffer, peakLimit, loop = false) {
  const data = channels(buffer);
  const fade = Math.min(Math.round(RATE * 0.012), Math.floor(buffer.length / 4));
  const join = Math.round(RATE * 0.004);
  let peak = 0;
  for (const out of data) {
    let sum = 0;
    for (const value of out) sum += value;
    const mean = sum / out.length;
    for (let index = 0; index < out.length; index += 1) out[index] -= mean;
    if (loop) {
      // Wrapped note tails supply musical continuity. A tiny smooth correction
      // also gives noise loops an exactly matched boundary, without a fade gap.
      const difference = out[out.length - 1] - out[0];
      for (let index = 0; index < join; index += 1) {
        out[out.length - join + index] -= difference * smooth(index / (join - 1));
      }
      out[out.length - 1] = out[0];
    } else {
      for (let index = 0; index < fade; index += 1) {
        const gain = smooth(index / (fade - 1));
        out[index] *= gain;
        out[out.length - 1 - index] *= gain;
      }
      out[0] = 0;
      out[out.length - 1] = 0;
    }
    for (const value of out) peak = Math.max(peak, Math.abs(value));
  }
  const scale = peak > 0 ? peakLimit / peak : 1;
  for (const out of data) {
    for (let index = 0; index < out.length; index += 1) out[index] *= scale;
  }
  return buffer;
}

function music(context) {
  const out = empty(context, 20, 2);
  const beat = 0.625; // Eight bars at 96 BPM; all tails wrap into the next loop.
  const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const melody = [
    [72, 76, 79, 76, 74, 72], [69, 72, 76, 79, 76, 72],
    [74, 76, 81, 79, 76, 74], [79, 74, 72, 69, 74, 76],
    [72, 79, 76, 81, 79, 76], [69, 76, 72, 74, 76, 79],
    [76, 74, 72, 79, 76, 74], [74, 79, 76, 74, 69, 72],
  ];
  const roots = [48, 45, 53, 55, 48, 45, 53, 55];
  const upper = [64, 60, 69, 62, 64, 60, 69, 62];
  const answers = [67, 64, 72, 67, 67, 64, 72, 67];
  const timing = [0.12, 0.85, 1.5, 2.12, 2.85, 3.5];
  melody.forEach((notes, bar) => {
    const start = bar * 4 * beat;
    notes.forEach((note, index) => mallet(out, start + timing[index] * beat,
      frequency(note), 1.15, index % 3 === 0 ? 0.25 : 0.19,
      index % 2 === 0 ? -0.2 : 0.2, false, true));
    mallet(out, start + 0.035, frequency(roots[bar]), 1.65, 0.3, -0.16, true, true);
    mallet(out, start + 2 * beat + 0.035, frequency(roots[bar] + 7), 1.4, 0.2, 0.16, true, true);
    mallet(out, start + 0.5 * beat, frequency(upper[bar]), 1.5, 0.095, 0.3, true, true);
    mallet(out, start + 2.5 * beat, frequency(answers[bar]), 1.3, 0.065, -0.3, true, true);
  });
  // Quiet opposite-channel room reflections, with circular reads at the join.
  const dry = channels(out).map((channel) => channel.slice());
  const delay = Math.round(0.093 * RATE);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = out.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      data[index] += dry[1 - channel][(index - delay + data.length) % data.length] * 0.085;
    }
  }
  return finish(out, 0.64, true);
}

function effect(context, name) {
  switch (name) {
    case 'click': {
      const out = empty(context, 0.11);
      mallet(out, 0, 720, 0.1, 0.7, 0, true);
      texture(out, 0, 0.035, 0.22, 500, 2800, 31,
        (time, duration) => envelope(time, duration, 0.002, 0.025));
      return finish(out, 0.48);
    }
    case 'water': {
      const out = empty(context, 1.2);
      texture(out, 0, 1.16, 1.1, 180, 2600, 1024, (time, duration) =>
        envelope(time, duration, 0.09, 0.17)
        * (0.72 + 0.16 * Math.sin(TAU * 6.7 * time) + 0.1 * Math.sin(TAU * 13.1 * time)));
      [0.13, 0.28, 0.49, 0.65, 0.86, 1.02].forEach((start, index) =>
        bubble(out, start, 570 + index * 71, 0.18));
      return finish(out, 0.69);
    }
    case 'flour': {
      const out = empty(context, 0.76);
      texture(out, 0, 0.73, 1, 1100, 4500, 2038, (time, duration) =>
        envelope(time, duration, 0.065, 0.16)
        * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(TAU * 29 * time)) ** 3));
      return finish(out, 0.54);
    }
    case 'knead': {
      const out = empty(context, 0.34);
      mallet(out, 0.012, 185, 0.28, 0.6, 0, true);
      mallet(out, 0.12, 247, 0.18, 0.13, 0, true);
      texture(out, 0, 0.22, 0.38, 100, 1200, 3011,
        (time, duration) => envelope(time, duration, 0.018, 0.13));
      return finish(out, 0.64);
    }
    case 'fold': {
      const out = empty(context, 0.33);
      texture(out, 0, 0.3, 0.8, 450, 2800, 4099, (time, duration) =>
        envelope(time, duration, 0.04, 0.1)
        * (0.35 + 0.65 * Math.sin(Math.PI * time / duration) ** 2));
      mallet(out, 0.16, 330, 0.14, 0.11, 0, true);
      return finish(out, 0.5);
    }
    case 'place': {
      const out = empty(context, 0.3);
      mallet(out, 0.006, 220, 0.27, 0.75, 0, true);
      mallet(out, 0.007, 587, 0.16, 0.13, 0, true);
      texture(out, 0, 0.08, 0.25, 400, 2300, 5021,
        (time, duration) => envelope(time, duration, 0.004, 0.055));
      return finish(out, 0.59);
    }
    case 'steam': {
      const out = empty(context, 3);
      texture(out, 0, 3, 1, 380, 2900, 6011, (time) =>
        0.73 + 0.12 * Math.sin(TAU * time / 3) + 0.06 * Math.sin(TAU * time));
      return finish(out, 0.36, true);
    }
    case 'tick': {
      const out = empty(context, 0.16);
      mallet(out, 0, 880, 0.15, 0.65, 0, true);
      return finish(out, 0.43);
    }
    case 'tickFinal': {
      const out = empty(context, 0.28);
      mallet(out, 0, 1046.5, 0.27, 0.65, 0, true);
      mallet(out, 0.014, 1568, 0.17, 0.14, 0, true);
      return finish(out, 0.59);
    }
    case 'celebrate': {
      const out = empty(context, 1.8, 2);
      [523.25, 659.25, 783.99, 1046.5].forEach((note, index) =>
        mallet(out, 0.04 + index * 0.115, note, 1.25, 0.25, index % 2 ? 0.22 : -0.22));
      const clap = empty(context, 1.8);
      [0.12, 0.4, 0.68].forEach((start, index) => {
        texture(clap, start, 0.12, 0.34, 700, 3600, 7001 + index, (time, duration) =>
          envelope(time, duration, 0.002, 0.07)
          * (Math.exp(-time * 62) + 0.55 * Math.exp(-Math.abs(time - 0.017) * 180)));
      });
      const claps = clap.getChannelData(0);
      for (const channel of channels(out)) {
        for (let index = 0; index < channel.length; index += 1) channel[index] += claps[index];
      }
      return finish(out, 0.72);
    }
    default: throw new Error(`Unknown sound: ${name}`);
  }
}

/** Call after the audio context is unlocked; subsequent calls reuse its buffers. */
export function createSoundBank(context) {
  if (!context || typeof context.createBuffer !== 'function') {
    throw new TypeError('createSoundBank requires an audio context with createBuffer().');
  }
  if (banks.has(context)) return banks.get(context);
  const bank = { music: music(context) };
  for (const name of ['click', 'water', 'flour', 'knead', 'fold', 'place', 'steam', 'tick', 'tickFinal', 'celebrate']) {
    bank[name] = effect(context, name);
  }
  Object.freeze(bank);
  banks.set(context, bank);
  return bank;
}
