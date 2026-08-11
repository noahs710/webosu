## ADDED Requirements

### Requirement: OK judgement window naming parity
The system SHALL use the lazer judgement window names: Great (300, `80-6*OD` ms), Ok (100, `140-8*OD` ms), Meh (50, `200-10*OD` ms), and Miss (0, fixed 400ms window). The existing webosu "Good" window (`GoodTime = 140-8*OD`) IS the lazer Ok window under a different name — the system SHALL treat them as the same (100 points, `140-8*OD` ms). The Classic mod changes scoring (V1 combo-bloated) but does NOT change the judgement windows.

#### Scenario: Ok window matches lazer
- **WHEN** a beatmap with OD=8 is played
- **THEN** the Ok (100-point) window is `140 - 8*8 = 78ms`, matching lazer's `OsuHitWindows`

#### Scenario: Classic keeps the windows
- **WHEN** the Classic mod is active
- **THEN** the Great/Ok/Meh/Miss windows are unchanged (Classic affects scoring, not judgement)