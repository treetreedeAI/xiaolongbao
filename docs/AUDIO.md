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
| water | 1.2 s | Filtered flowing texture with small surface bubbles |
| flour | 0.76 s | Fine dry sprinkle |
| knead | 0.34 s | Rounded bouncy contact, no wet texture |
| fold | 0.33 s | Gentle dry folding/rustle |
| place | 0.30 s | Soft ingredient/bun placement |
| steam | 3 s, looping | Soft filtered hiss with slow breathing variation |
| tick / tickFinal | 0.16 / 0.28 s | Gentle countdown; the final note is slightly stronger |
| celebrate | 1.8 s | Rising musical flourish and three quiet synthesized claps |

These are original procedural sounds, not downloaded music or recorded Foley.
No external licenses, CDN, audio downloads, voice tracks or dependencies are used.
Audio code is part of the normal Vite JavaScript bundle and therefore included in
the existing generated offline precache. No separate MP3/WAV assets or cache
configuration changes are needed, including at `/xiaolongbao/`.

## Mixing and lifecycle

- One AudioContext, created only after a trusted tap/pointer/keyboard interaction.
- Music is quieter than effects and smoothly ducks during actions/countdown/finale.
- Separate music, steam and effects buses feed a compressor and conservative
  master gain. PCM peaks are at most 0.72; envelopes avoid hard waveform edges.
- One active voice per UI/action/tick/celebration group, with short replacement
  fades. UI taps are throttled to at most one per 90 ms.
- Steam begins at the existing step-seven steam cue (81% of the action), fades
  out when the player leaves that step, and stops during pause/backgrounding.
- Countdown reads the existing five displayed digits, never its own game timer.
- Hidden pages and existing dialogs fade/pause audio. Visibility restoration,
  modal close and fresh gestures can resume suspended/interrupted contexts.
- Contexts, sources and listeners are cleaned up on unmount, including React
  StrictMode replay. Audio failure cannot prevent the game from continuing.

## Verification

- `npm test`: 46 passing tests (20 existing, 26 audio-specific).
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
