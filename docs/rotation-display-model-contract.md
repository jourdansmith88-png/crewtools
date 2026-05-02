# Rotation Display Model Contract

This document captures the current stable screenshot-backed rotation display model contract before adding iCrew support.

## Scope

This contract describes how screenshot-backed rotations are normalized and displayed after MiCrew parsing.

It is intentionally narrower than parser/OCR behavior. The parser may evolve, but the display model contract below should stay stable unless explicitly changed with regression coverage.

## Canonical Display Model

Screenshot-backed rotations must flow through one shared display model. The display model is the source of truth for user-facing rotation state.

The display model owns:

- `allTripSegments`
- `visibleOperatingLegs`
- `deadheadAnnotations`
- `logbookLegs`
- `scheduledBlock`
- `partialStatus`

## Field Definitions

### `allTripSegments`

`allTripSegments` is the full canonical trip sequence after candidate normalization, dedupe, ordering, and terminal handling.

It may include:

- operating legs
- deadhead segments
- return-to-gate segments

It is the right source for:

- full trip continuity
- deadhead return-to-base completion checks
- final arrival after deadhead
- debug/export inspection

### `visibleOperatingLegs`

`visibleOperatingLegs` is the operating-only user-facing trip chain.

Rules:

- Deadheads must not appear here.
- Deadhead detection must not mutate the operating chain ordering.
- Operating legs before, between, or after DH segments must remain visible if they are valid trip segments.
- This is the user-facing chain for:
  - Rotation Snapshot operating-leg counts
  - Next Flight
  - operating scheduled block
  - final operating arrival
  - Logbook

### `deadheadAnnotations`

`deadheadAnnotations` is the separate metadata layer for screenshot-detected DH segments.

Rules:

- DH evidence does not become an operating leg.
- DH evidence must not enter Logbook operating export.
- DH annotations may include:
  - city pair
  - carrier
  - flight number
  - scheduled out/in
  - confirmation code
  - marker type such as `D` or `O`
  - evidence source

### `logbookLegs`

`logbookLegs` must equal the operating-only display chain.

Rules:

- Logbook is operating-only.
- DH annotations are displayed elsewhere, not as operating logbook legs.
- No alternate parser/debug/raw candidate arrays may feed Logbook directly.

## Scheduled Block Rules

`scheduledBlock` in the display model follows these rules:

1. Prefer a true rotation-level header scheduled block only when it comes from an explicit rotation-level field.
2. Do not treat leg-level `Blk- h:mm` values as header scheduled block.
3. If no true header scheduled block exists, compute scheduled block from `visibleOperatingLegs` only.
4. Deadhead segments must not be included in operating scheduled block.

## Partial Status Rules

`partialStatus` must come from the final display-model diagnosis only.

Rules:

1. The visible partial banner must use the final display-model partial value only.
2. Legacy parser flags must not independently re-enable the partial banner after display-model completion says false.
3. When deadhead annotations exist, completion may be evaluated using `allTripSegments`, not just `visibleOperatingLegs`.
4. A trip can be complete even if the operating chain does not return to base, as long as the full trip segments return to base and the header/trip boundary evidence is present.

## DH Annotation Rules

Current stable DH behavior:

- DH never mutates the operating chain.
- DH never becomes a Logbook operating leg.
- Snapshot may show:
  - operating leg count
  - DH leg count
  - final operating arrival
  - final arrival after DH
- What Matters can show DH-specific quick-action cards.

## Known Passing Fixtures

The following fixtures currently define the stable MiCrew screenshot baseline:

- `0983` wrapped/duplicate chain
- `0118` terminal DH
- `0233` two DHs, including offline `O` marker
- `7942` normal no-DH
- `7942` missing-tail partial
- `7942` trailing/missing-header partial

These fixtures are covered by `npm run test:rotation-chain`.

## Rule For New Parsers

New sources such as iCrew must normalize into the same candidate schema and use the same display model.

Required rule:

- New parsers may produce normalized candidate legs.
- They must not create a parallel display path for snapshot, logbook, DH handling, or partial diagnosis.
- They must feed the same display-model contract described here:
  - `allTripSegments`
  - `visibleOperatingLegs`
  - `deadheadAnnotations`
  - `logbookLegs`
  - `scheduledBlock`
  - `partialStatus`

If a new parser needs special extraction logic, that logic belongs before display-model assembly, not in a separate display/runtime path.
