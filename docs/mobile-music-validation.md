# Mobile music recovery — 2026-09-13

The previous player fetched and decoded the complete 11,704,283-byte, 365.688-second MP3 before starting playback, with a 20-second hard timeout. The download alone takes about 47 seconds at 2 Mbps, and decoded stereo Float32 PCM takes about 129 MB. It also used AbortSignal.timeout and resumed AudioContext only during initial setup; older mobile implementations or an interrupted context could therefore remain silent.

## Changes

- Stream the original licensed MP3 through one HTMLAudioElement and one MediaElementAudioSourceNode. Keep the existing music gain and effects separation; only the five-second ignition clip is decoded into a Web Audio buffer.
- Start media.play() and AudioContext.resume() inside Start/Resume/Unmute gestures, before building opponents. Gameplay setup does not wait for a pending resume promise.
- Pause media synchronously on pause, background interruption, menu and finish. Resume preserves currentTime; restart seeks to zero. Mute remains in force when resuming a paused game.
- Retry transient failures with finite backoff. Preserve playback-permission blocks until a new explicit gesture; late play promises and canplay events cannot revive cancelled playback or cause per-frame retries.
- Load the short ignition clip with AbortController plus a clearable timeout, and support callback-style decodeAudioData. No continuous engine or throttle sound has been added.

## Verification

`npm test`: **112/112 passed**, including 15 audio checks (11 streaming/recovery and four ignition checks). `npm run build` passed. The existing >500 kB JavaScript chunk advisory remains.

Chrome / Playwright, 390 x 844 viewport, DPR 2.625, mobile metrics and touch emulation; AbortSignal.timeout deliberately unavailable; network limited to 250,000 bytes/s download and 80 ms latency after scene loading:

- Trusted touch on Start produced running AudioContext, ready streaming media and advancing playback. At music time 9.677 seconds, only 98.284 seconds of the 365.688-second track was buffered. The only decoded asset was the 441,078-byte ignition WAV; no full music PCM decode.
- Measured nonzero final-output waveform after ignition ended. At 89.937 seconds: RMS 0.00709, peak 0.01955. This verifies a non-silent browser signal, not physical speaker volume or a listening review.
- Pause retained 89.969 seconds and produced RMS 0. Explicitly suspend AudioContext, then click Resume: context running, music at 91.278 seconds, RMS 0.00677.
- Simulated window blur paused both race and music immediately, with RMS 0. Restart returned to 0.038 seconds during countdown and resumed after countdown. Returning to the menu paused music with RMS 0. Mute and unmute controls changed enabled state correctly.
- No page errors were reported. Existing mobile driving, model, plate and cabin checks are recorded in lux3d-car-validation.md.

These are browser/mobile-emulation checks, including an explicitly suspended audio context. No physical iPhone, Android speaker or Safari session was used. Cloud deployment is verified separately after publishing.
