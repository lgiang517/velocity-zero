# Mobile and scenery release — 2026-09-15

## Changes

- Balanced touch mode retains 1x rendering on ordinary phone viewports and disables dynamic car reflection captures. Cap the total pixel budget on large touch displays (600K low / 900K balanced / 1.4M high), without changing desktop quality.
- In balanced touch mode only, sustained frame rate below 45 FPS across two 1.5-second windows lowers render resolution to 85%, then at most 72%. A three-second warmup excludes startup/resume; pause, background gaps and inactive screens do not trigger reduction. No automatic upward oscillation. Explicit quality selection resets this adaptive scale. Physics, input timing, selected quality and saved preferences are unchanged.
- Touch devices use the composer's existing MSAA only; the final canvas no longer allocates redundant default-framebuffer antialiasing.
- Short landscape (up to 340px high): place four camera tools in one centered row and hide the minimap to prevent overlap with pedals. Preserve all driving and camera targets at 44px minimum.
- Include the local houses, tunnel walkway, ocean, trees, grass, mountains, sky and two user-provided music updates. Keep exactly three selectable vehicles and five colors per car. Existing release preparation omits retired model/music files and review artifacts from the Pages bundle.

## Browser evidence

`output/playwright/mobile-release/check.js`: touch-enabled Chrome at 390x844, 844x390 and 568x256. All driving/camera buttons stay in viewport, at least 44px, and do not overlap. Two simultaneous CDP touch pointers activate throttle and steering; touchCancel releases both. Both music tracks advance with running AudioContext. A simulated orientationchange event pauses the race/music and clears held input. No collected JavaScript errors. The test uses desktop browser emulation, not physical iOS/Android hardware.

The original 568x256 tool/pedal vertical overlap (tools y67..160; pedals y132..246) is recorded in short-before.jpg; corrected layout is in 568x256.jpg. Corresponding render-policy tests cover sustained load, fixed minimum resolution, no oscillation, background gaps and large touch screen budgets.
