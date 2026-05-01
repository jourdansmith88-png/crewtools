# Rotation Screenshot Regression Expectations

This document captures the expected result for the known-good screenshot-backed
MiCrew chain case so future parser/stitching changes can be checked against it.

## Successful Screenshot-Backed Chain Case

When the screenshot-backed route chain is reconstructed correctly, the app
should satisfy all of the following:

- No `Partial Rotation Detected` banner.
- `final arrival = SLC`
- Final visible Logbook leg = `SAT-SLC`
- No visible legs after `SAT-SLC`
- `userFacingLegs count = 9`
  - unless deadhead classification later changes the operating / DH split
- Discarded fragments are allowed only in debug, never in visible UI
- `finalArrival === last userFacingLeg.destination`

## User-Facing Expectations

Only the selected final ordered user-facing chain may drive:

- Rotation Snapshot
- Final arrival
- Operating / DH leg counts
- Scheduled block
- Next Flight
- Logbook visible list

The following must never be appended into the user-facing list after the final
ordered chain is selected:

- unmatched candidates
- discarded fragments
- fallback parsed legs
- duplicate overlap copies
- screenshot trace fragments

## Debug-Only Allowed

These are allowed in the dev trace only:

- discarded fragment counts
- discarded fragment reasons
- duplicate reasons
- raw flight candidates
- unmatched legs
- fragment counts

## Current Expected Terminal Sequence

For the known screenshot set discussed in the related debugging thread, the end
of the visible user-facing chain should be:

1. `MSP-SAT`
2. `SAT-SLC`

That means:

- `SAT-SLC` is the visible terminal Logbook leg
- `SLC` is the final arrival

## Scheduled Block Note

For the current live-captured screenshot set:

- `headerScheduledBlockMinutes` is `null`
- the captured MiCrew header text contains `Credit` and `TAFB`
- but it does not contain a rotation-level `Block` / `Scheduled Block` field

Because of that, the current displayed scheduled block falls back to the
computed value from the 9 visible legs:

- `computed scheduled block = 20:29`

Future operating-block behavior requires deadhead annotation and block-policy
decisions. It should not require further rotation chain changes.

## Capture Workflow

Use this workflow to capture the next screenshot-backed rotation into the
regression harness without changing builder logic first:

1. Open the local web app with the debug flag:
   - `http://localhost:3000/?rotationDebug=1`
2. Load the screenshot-backed rotation in Rotation Companion.
3. In `Rotation Snapshot`, click `Copy live chain debug JSON`.
4. Paste that payload into a new fixture file under:
   - `src/features/rotationCompanion/__fixtures__/`
5. Add the expected visible city-pair chain and snapshot expectations to the
   fixture registry.
6. Run:
   - `npm run test:rotation-chain`

The copied debug JSON should be treated as evidence of the live runtime input.
Do not tune chain heuristics until the captured payload is represented by a
failing fixture in the regression harness.

## Duplicate Noise Note

Some live-captured payloads include duplicate or unmatched candidate noise such
as:

- `DL716` versus `716`
- null-date duplicates of richer dated candidates
- partial rows that repeat a complete row already present

These are debug-only artifacts. They may remain visible in trace/debug output,
but they must not affect the final visible user-facing chain.
