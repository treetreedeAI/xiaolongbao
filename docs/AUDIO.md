# Audio-only sound layer

## Audit and scope

The deployed source at `a0f5ab3d307d8c0f75b073cceb2a9e967ac8d01c` contained
no audio files, playback code or sound libraries. This implementation adds sound;
it does not replace existing recordings. `App.jsx` only imports and calls
`useGameAudio(game)`. The hook observes existing snapshots and trusted gestures.
It does not change game handlers, clocks, DOM, artwork, animation or PWA settings.

## Original sounds

`src/audio/soundBank.js` generates deterministic PCM buffers at 22,050 Hz:

| Buffer | Duration | Design |
| --- | --- | --- |
| music | 20 s, looping | Original instrumental pentatonic mallet/kalimba-style melody, rounded wooden bass, no vocals |
| click | 0.11 s | Soft wooden UI tap |
| water | 1.3 s | Slow rounded gurgles, softer flow and a playful final drop |
| flour | 1 s | Light, soft powder with slower sprinkle pulses |
| knead | 0.34 s | Two soft, elastic plush pops, no wet texture |
| ignition | 0.8 s | Three soft stove-ignition clicks followed by a short warm whoosh |
| fold | 0.33 s | One cute rounded chirp per fold; the three actions form three chirps |
| place | 0.30 s | Soft “doo” tone shared by filling and bun placement |
| steam | 3 s, looping | Soft filtered hiss with slow breathing variation |
| tick / tickFinal | 0.16 / 0.28 s | Gentle countdown; the final note is slightly stronger |
| celebrate | 4.2 s | Sustained layered applause and two soft steam puffs; no human voices |

Music and effects are original procedural sounds. The proposed recorded Wow
was removed before publication following the user's revised request. The finale
uses synthesized handclaps rather than a crowd recording so there are no incidental
voices. Everything is part of the normal Vite JavaScript bundle, covered by the
existing generated offline precache. There is no runtime CDN fetch, speech
synthesis, audio-file request, codec decode, new dependency or PWA configuration
change, including at `/xiaolongbao/`.

The revision changes only sound design for flour, water, kneading, filling/final
placement, folding, ignition and the finale. Golden PCM hashes verify music,
click, steam and both countdown cues remain exactly identical to the deployed
release; knead and ignition remain identical to the first approved revision.
Mix-bus gains are unchanged. Slower flour/water sounds fit within the existing
1.35-second action plus settling window; no animation or game clock was changed.

## Mixing and lifecycle

- One AudioContext, created only after a trusted tap/pointer/keyboard interaction.
- Music is quieter than effects and smoothly ducks during actions/countdown/finale.
- Separate music, steam and effects buses feed a compressor and conservative
  master gain. PCM peaks are at most 0.72; envelopes avoid hard waveform edges.
- One active voice per UI/action/tick/celebration group, with short replacement
  fades. UI taps are throttled to at most one per 90 ms.
- Steam begins at the existing step-seven steam cue (81% of the action), fades
  out when the player leaves that step, and stops during pause/backgrounding.
- Ignition plays once when the existing flame begins fading in (8% of step seven).
  Reduced-motion/skipped frames have a one-shot completion-edge fallback. Leaving
  the step stops it; paused or unavailable cues do not catch up and stack later.
- Countdown reads the existing five displayed digits, never its own game timer.
- Hidden pages and existing dialogs fade/pause audio. Visibility restoration,
  modal close and fresh gestures can resume suspended/interrupted contexts.
- Contexts, sources and listeners are cleaned up on unmount, including React
  StrictMode replay. Audio failure cannot prevent the game from continuing.

## Verification

- `npm test`: 59 passing tests (20 game-state tests, 39 audio-specific).
- Production build with `PAGES_BASE_PATH=/xiaolongbao/`: passing.
- All 45 existing Chromium end-to-end tests: passing, including offline gameplay.
- Existing WebKit tests with iPhone and iPad profiles: 8 passing cases covering
  complete flow, touch, background/modal pause and standalone code paths.
- Two additional WebKit offline-reload checks hit a browser internal error at
  `context.setOffline(true)` followed by `page.reload()`. The same two failures
  reproduce on an exact pre-audio application build; no PWA code was changed.

WebKit emulation and mock audio-lifecycle tests are not physical iOS testing.
Before a device-specific sign-off, listen on an actual iPhone/iPad in Safari and
an installed PWA: start by tapping, finish all steps, background/lock and return,
interrupt with system audio, and reopen offline after precache completes.
