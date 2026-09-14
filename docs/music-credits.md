# Racing music credits

## Current soundtrack — two selectable tracks

**Raving Energy (faster)** by **Kevin MacLeod** (incompetech.com), **CC BY 4.0**.

- Official track: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1900012
- Official catalog: https://incompetech.com/music/royalty-free/pieces.json
- Original MP3: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Raving%20Energy%20%28faster%29.mp3
- License: https://creativecommons.org/licenses/by/4.0/
- Composer licensing: https://incompetech.com/music/royalty-free/licenses/
- Verified/downloaded: 2026-09-14. ISRC USUAN1900012. Official tempo: 134 BPM; synths and percussion.
- Game asset: `public/audio/raving-energy-car-dj.mp3`, stereo 44.1 kHz / 192 kbps, about 4:04.
- Adaptation: Car DJ bass edit. 28 Hz high-pass, +4 dB low shelf at 95 Hz, -1.5 dB at 260 Hz, -1 dB treble shelf, two-pass -12 LUFS / -1.5 dBTP target. Original tempo and pitch retained. Reproduce with `python tools/prepare-dj-music.py` (FFmpeg required).
- The game retains HTMLAudio streaming, looping, gesture unlock, pause/resume, mute and the music slider. The music bus multiplier increases from 0.4 to 0.75; sound effects are unchanged.
- Required visible attribution: **Raving Energy (faster) — Kevin MacLeod (incompetech.com) · Car DJ bass edit · CC BY 4.0**. The composer does not endorse the game.

Final MP3 measurement: -12.30 LUFS integrated, -1.07 dBTP, 0.80 LU loudness range; 5,848,922 bytes.

Validation: 15 audio tests and production build passed. Chrome mobile/touch emulation (390 x 844) started the new URL with a running AudioContext and advancing playback. Duration 243.644 s, loop=true; seeking near the end wrapped to 0.020 s. Pause held 0.020 s and resume advanced to 1.001 s. Evidence: output/music-dj/mobile-check.log. No physical-phone speaker or Safari listening verification was performed.

The recording was decoded and measured for validity and loudness. These technical checks are not a claimed listening assessment.

## Added track: Cipher

**Cipher** — **Kevin MacLeod (incompetech.com)**, **CC BY 4.0**.

- Official track and license attribution: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100844
- Original MP3 (filename verified in the official pieces.json catalog): https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher2.mp3
- License: https://creativecommons.org/licenses/by/4.0/ — permits redistribution and adaptation, including commercial use, with attribution and change disclosure.
- Verified and downloaded 2026-09-14; ISRC USUAN1100844; 150 BPM; official mood Bright / Grooving / Uplifting, synths, electric piano, percussion and strings.
- Game asset: `public/audio/cipher-car-dj.mp3`, 231.262 seconds, stereo 44.1 kHz, 192 kbps, 5,551,737 bytes.
- Adaptation: Car DJ bass edit using the same low-frequency EQ and loudness-processing approach as the existing soundtrack; tempo and pitch unchanged. Reproduce with `python tools/prepare-cipher-music.py`.
- Final MP3 measurement: -13.92 LUFS integrated, -1.49 dBTP, 5.90 LU loudness range.
- Settings expose both Raving Energy (faster) and Cipher. Each selected track loops individually. Track selection persists across reloads. Switching reuses the existing media element and WebAudio node, resets playback to zero, and preserves pause/mute state.
- Both track titles, author, source links, adaptation notice and CC BY 4.0 link are visible in the settings. No endorsement by the composer is implied.
- Validation: 18 audio/ignition tests and production build passed. Chrome mobile/touch emulation (390 x 844) started Cipher with readyState 4 and a running AudioContext, playback advanced past 0.60 s, pause/resume worked, switching back played Raving Energy, and refreshing restored the selected Cipher. Evidence: output/playwright/music-second/check.js and mobile-settings.jpg. Final file decoded and loudness measured; these technical checks do not claim a listening assessment or physical-phone/Safari verification.

## Previous soundtrack (retained, not played)

**EDM Detection Mode** by **Kevin MacLeod** (incompetech.com).
Licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

- Official track: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1500026
- Official composer description: https://incompetech.com/wordpress/2015/04/edm-detection-mode/
- Original MP3: https://incompetech.com/music/royalty-free/mp3-royaltyfree/EDM%20Detection%20Mode.mp3
- License: https://creativecommons.org/licenses/by/4.0/
- Author licensing page: https://incompetech.com/music/royalty-free/licenses/
- Official catalog: https://incompetech.com/music/royalty-free/pieces.json
- Verified and downloaded: 2026-09-12
- ISRC: USUAN1500026
- Style: electronic dance music with a strong backbeat and bass, 128 BPM; instrumental selection based on the official catalog, not a claimed listening assessment.
- Local asset: `public/audio/edm-detection-mode-kevin-macleod.mp3`
- Decoded duration: 365.688 seconds (6:05.688), stereo, 44.1 kHz MP3; 11,704,283 bytes.
- Full-file loudness analysis: -12.43 LUFS integrated, +0.18 dBTP true peak, 3.90 LU loudness range. Playback applies substantial gain reduction; the source is not amplified.

The downloaded recording is unmodified. The previous game version streamed it through an HTMLAudioElement and a Web Audio gain bus, loops it and applies playback volume. It fades in on racing and immediately pauses on pause/menu/finish, including when background animation frames stop. It no longer downloads and decodes the entire six-minute track before playback. Pausing retains playback position; `resetMusic()` returns to the beginning for a new race. The composer does not endorse this game.

Previous game credit: **EDM Detection Mode — Kevin MacLeod (incompetech.com) · CC BY 4.0**, with links to the track and license above.

The download was completely decoded and measured with FFmpeg. This verifies format and file integrity; it does not constitute a listening review.

The music has no added rival, wind, tire or fallback bass layers. Transient music load failures receive up to three automatic recovery attempts with backoff; an explicit play/resume gesture can retry again. If the recording remains unavailable or the browser denies playback, music stays silent. Playback is unlocked in the same user gesture as Start/Resume/Unmute, before expensive scene setup. Short event cues and the single ignition sound described below remain available.

## Retained previous asset (not played)

**Exhilarate** by **Kevin MacLeod** (incompetech.com), CC BY 4.0.

- Track: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1300028
- Original MP3: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Exhilarate.mp3
- License: https://creativecommons.org/licenses/by/4.0/
- Local asset: `public/audio/exhilarate-kevin-macleod.mp3`
- Downloaded 2026-09-05, unmodified recording. Retained to preserve the previous resource; no longer selected by the game.

## Single ignition sound

The game has **no continuous engine, throttle, RPM, intake or gear-change sound**. Starting a new race plays one restrained five-second startup and engine-roar recording. Pressing or releasing the accelerator never triggers it. Pause, menu and mute cancel the cue and any pending load. Existing countdown, collision and reward cues are retained; the EDM soundtrack is unchanged.

**Ferrari 360 Spider - engine sound** — **PritzProductions**, Freesound sound 241083, **CC0 1.0**.

- Official source and license evidence: https://freesound.org/people/PritzProductions/sounds/241083/
- Official HQ preview downloaded: https://cdn.freesound.org/previews/241/241083_3450345-hq.mp3
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Verified before download: 2026-09-12.
- Author description: Zoom H6 stereo recording directly above the engine of the standing Ferrari 360 Spider.
- Retained original HQ preview: `public/audio/engine/ferrari-360-source.mp3` (not a claim to have downloaded the original WAV master).
- Game asset: `public/audio/engine/ferrari-start-5s.wav`.

Preparation is reproducible with `python tools/prepare-engine-audio.py` and FFmpeg: crop one continuous 1.35–6.35-second passage (no repetition), convert to mono 44.1 kHz PCM, remove subsonic/upper hiss, apply gentle dynamic control and -20 LUFS / -6 dBTP loudness targets, then add a 45 ms fade-in and 750 ms natural fade-out. Playback is one-shot at the recording's original speed, with a gain of 0.40 times the effects-volume setting and the existing master gain. Its brief startup roar is audible over the countdown, with a default playback peak around -26 dBFS; the music continues unchanged.

Previously evaluated looping layers and previews were removed. The jtvdb idle recording (https://freesound.org/people/jtvdb/sounds/857147/, CC0), EwanPenman11 drive-off recording (https://freesound.org/people/EwanPenman11/sounds/659560/, CC0) and djbono F456 recording (Sampling+, not CC0) are not used. No synthetic engine oscillator remains. Ferrari and the recordist do not sponsor or endorse the game.
