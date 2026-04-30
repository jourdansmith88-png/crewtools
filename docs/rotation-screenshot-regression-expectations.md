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

