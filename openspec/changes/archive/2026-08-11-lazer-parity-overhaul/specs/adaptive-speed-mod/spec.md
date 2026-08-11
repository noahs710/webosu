## ADDED Requirements

### Requirement: Adaptive Speed audio rate adjustment
The Adaptive Speed mod SHALL dynamically adjust the audio playback rate based on the player's recent accuracy. When the player is hitting accurately, the rate SHALL increase up to a lazer-defined maximum (`AdaptiveSpeedMaxRate`, ~1.05x); when missing, the rate SHALL decrease back toward 1.0x. The adjustment SHALL be gradual to avoid audio artifacts.

#### Scenario: Speed increases on accurate play
- **WHEN** Adaptive Speed is active and the player hits 10 consecutive Greats
- **THEN** the audio playback rate increases by a small step toward `AdaptiveSpeedMaxRate`

#### Scenario: Speed decreases on misses
- **WHEN** Adaptive Speed is active and the player misses
- **THEN** the audio playback rate decreases toward 1.0x

### Requirement: Adaptive Speed visual sync
The hit object timing SHALL remain synchronized with the adjusted audio rate so objects approach at the new speed. The approach rate SHALL scale with the playback rate.

#### Scenario: Objects approach faster at higher rate
- **WHEN** Adaptive Speed has increased the rate to 1.05x
- **THEN** approach circles shrink 5% faster, matching the audio