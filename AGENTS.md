# FlightCrewTools Agent Instructions

## Project priority

FlightCrewTools is aviation software. Correctness beats speed. Do not make speculative parser, legality, pay, or schedule logic changes without a fixture or failing test.

## Required commands

After code changes, run:

- `npm run test:rotation-chain`
- `npm run build:web`

If UI files change, also inspect mobile viewport behavior when possible.

## Agent roles

### Rotation QA Agent

Purpose:
- Protect parser correctness.
- Build realistic MiCrew/iCrew test fixtures.
- Convert bid-package-style inputs into test rotations.
- Create expected JSON before parser changes.
- Stress-test:
  - deadheads
  - continuation order
  - duplicate legs
  - partial uploads
  - missing headers
  - return-to-base logic
  - total credit/block
  - FAR 117 day grouping

Rules:
- Do not change UI.
- Do not change parser logic unless explicitly asked.
- Prefer adding fixtures and tests first.
- Report expected vs actual clearly.

### UI Product Agent

Purpose:
- Protect mobile usability and brand consistency.
- Review screens like a Delta pilot using the app during a busy trip.
- Improve:
  - spacing
  - card hierarchy
  - bottom-nav clearance
  - touch targets
  - iPhone viewport behavior
  - FlightCrewTools instrument-panel style
  - ECAM green/red/cyan signal language

Rules:
- Do not change parser, pay, FAR, or rotation logic.
- Keep changes small and reversible.
- Do not redesign the whole app unless asked.
- Preserve existing functionality.

## Reporting format

Every Codex response should end with:

- Changed files
- Tests run
- Build result
- Known risks
- Suggested next step
