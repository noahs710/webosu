## MODIFIED Requirements

### Requirement: Mod settings bridge tolerates empty beatmaps
The system SHALL allow a mod settings bridge handoff to succeed even when the active beatmap has zero hit objects, because the `Playback` constructor exits cleanly instead of throwing during initialization.

#### Scenario: Empty beatmap with mods active
- **WHEN** the user activates a mod (e.g. Flashlight) and then loads a beatmap with zero hit objects
- **THEN** the mod settings that the bridge wrote to `game` remain in effect for the next non-empty launch; the empty beatmap does not throw during construction
