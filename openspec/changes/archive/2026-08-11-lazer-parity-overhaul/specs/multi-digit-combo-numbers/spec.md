## ADDED Requirements

### Requirement: Multi-digit combo number rendering
The system SHALL render combo numbers for combos >99, supporting at least 3-digit (100-999) and 4-digit (1000-9999) combos. Each digit SHALL be positioned using the `hitNumberKey` logic with `HitCircleOverlap` respected, extending the current 2-digit support.

#### Scenario: 3-digit combo renders
- **WHEN** a hit object has combo index 142 (combo >99)
- **THEN** three digit sprites render for "1", "4", "2" positioned with `HitCircleOverlap` respected, not the "combos > 99 hits are unsupported" fallback

#### Scenario: 4-digit combo renders
- **WHEN** a combo reaches 1234
- **THEN** four digit sprites render for "1", "2", "3", "4" with correct spacing

### Requirement: Digit anchor for multi-digit combos
For multi-digit combo numbers, the leftmost digit SHALL anchor at x=1 (right-aligned to the next digit), the rightmost at x=0 (left-aligned), and middle digits at x=0.5 (centered), matching the existing 2-digit pattern extended to N digits.

#### Scenario: 3-digit anchors
- **WHEN** combo "142" renders
- **THEN** the "1" anchors x=1, the "4" anchors x=0.5, the "2" anchors x=0, and they are positioned left-to-right with `HitCircleOverlap` offset