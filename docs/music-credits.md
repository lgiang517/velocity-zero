# Racing music credits

## Current soundtrack

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

The downloaded recording is unmodified. The game loops it, applies playback volume, and fades it on transitions. Pausing retains playback position; `resetMusic()` returns to the beginning for a new race. The composer does not endorse this game.

Required visible game credit: **EDM Detection Mode — Kevin MacLeod (incompetech.com) · CC BY 4.0**, with links to the track and license above.

The download was completely decoded and measured with FFmpeg. This verifies format and file integrity; it does not constitute a listening review.

The music has no added rival, wind, tire or fallback bass layers. If the recording cannot load or decode, music stays silent. Short event cues and the single ignition sound described below remain available.

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
