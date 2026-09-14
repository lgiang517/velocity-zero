# Brake lights and registration plates

Local repair, 2026-09-14. Roster remains DB12, GTC4Lusso, 812 Competizione.

- `vehicle_plates.py` removes overlapping original plates and creates one front/rear plate with mounted frame, white face and independent correctly oriented lettering. IDs: VZ-DB12, VZ-GTC4, VZ-0812.
- DB12 keeps adjacent tail/brake ribbons and separates the original tail lens covers from cabin glass. Lower reflectors do not emit. The turn-indicator overlays are removed; turn signals are not simulated.
- GTC4Lusso retains its authored ring geometry and lamp atlas, with independent high-stop and combined rear-light roles.
- 812 rear lamp centers/chrome and low reflectors stay separate. Four red annular inserts follow the original curved lamp covers, sampled by raycast. These are game adaptations, not a claim of factory-exact lamp construction.
- `imported-car.js` consumes explicit lamp role metadata. Diffusers suppress white specular highlights and tone mapping; separate transparent covers retain reflections. Brake-only lights are off when released. Front lamps do not change under braking.

Validation: 175 tests passed; production build passed. Inspected 24 orbit images, 6 plate close-ups, 6 brake-state images and the game S-key press/release for all three cars. Game brake reached 0.9998 and returned below 0.01. Evidence: output/lights-plates-audit/index.html, final-audit.log, game-check.log, tests.log, build.log.

Limits: 812 badges still show source-material gray blocks; GTC4Lusso source has no interior. Public deployment remains pending the previously required explicit upload approval.
