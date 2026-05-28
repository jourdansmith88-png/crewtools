# LAX 350 Rotation QA Fixture Candidate Batch

Source material reviewed:

- `/Users/StarJ/Downloads/LAX35BJUN.zip`
  - `pilaxr.35b` raw master pairings
  - `pilaxt.35b` bid package timeline / package text
- `/Users/StarJ/Downloads/LAX350 JUN.pdf`

Role: Rotation QA Agent only

Guardrails:

- Do not change parser logic from bid-package evidence alone.
- Create expected structure before changing parser behavior.
- Use these candidates to expand MiCrew/iCrew fixture coverage, especially for augmented crew and 117-sensitive day grouping.

## Why the LAX 350 source matters

The LAX 350 package adds cases that are weakly covered in the current MiCrew/iCrew fixture set:

- augmented long-haul pairings
- deadhead plus augmented duty chains
- position-specific pairings (`POS - B`)
- day rows with `0.00/0.00` style placeholders on DH segments
- hotel/layover rows embedded between augmented duties
- international pairings with high FDP/TAFB values

## Candidate 1

- Fixture id: `lax-350-aug-cdg-001`
- Source pairing number: `#A410`
- Aircraft/base/seat/category:
  - Base: `LAX`
  - Fleet: `350`
  - Position: `POS - A,B`
  - Pairing family: long-haul augmented Europe turn
- Why this case matters:
  - clean augmented long-haul control case
  - very clear `PWA FDP/MAX` rows with `3` pilot/augmented context
  - straightforward layover/hotel insertion (`CDG 24.10/HYATT PARIS ETOILE`)
  - strong baseline for future 117 augmented-duty expectations
- Expected parser risks:
  - interpreting augmented FDP maxima without treating them as standard unaugmented values
  - preserving long-haul layover row placement
  - ensuring total credit/block/TAFB remain aligned on a two-duty international pairing
- Recommended bucket: `known-good`

## Candidate 2

- Fixture id: `lax-350-aug-dh-ams-001`
- Source pairing number: `#A413`
- Aircraft/base/seat/category:
  - Base: `LAX`
  - Fleet: `350`
  - Position: `POS - B`
  - Pairing family: DH + augmented long-haul Europe pairing
- Why this case matters:
  - strongest mixed duty example in the source set
  - starts with DH (`LAX-MSP`), then augmented operating (`MSP-AMS` / `AMS-MSP`), then ends with DH (`MSP-LAX`)
  - includes multiple layover rows and duty-day splits across `A / B / D / E`
  - directly useful for future 117 augmented-crew scenarios and DH accounting
- Expected parser risks:
  - leading DH row before any operating row
  - `0.00/0.00` max placeholders on DH segments
  - preserving day lettering continuity with skipped letters (`A`, `B`, `D`, `E`)
  - distinguishing operating block from deadhead credit
  - ensuring totals do not double-count DH block as operating block
- Recommended bucket: `generated`

## Candidate 3

- Fixture id: `lax-350-domestic-dh-control-001`
- Source pairing number: `#1501`
- Aircraft/base/seat/category:
  - Base: `LAX`
  - Fleet: `350`
  - Position: `POS - A,B`
  - Pairing family: domestic same-day DH + operating control
- Why this case matters:
  - compact domestic control case
  - first leg is explicitly DH (`LAX-DTW`), second leg is operating (`DTW-LAX`)
  - good sanity check that the parser handles 350 but non-augmented/simple structure correctly
  - useful as a control when comparing augmented behavior against simpler same-day trips
- Expected parser risks:
  - DH marker on the opening leg of the pairing
  - `4.26DHD` standalone recovery line
  - ensuring total block stays at operating-only value while DH stays in credit/deadhead totals
- Recommended bucket: `known-good`

## Candidate 4

- Fixture id: `lax-350-aug-dh-ams-partial-001`
- Source pairing number: derived from `#A413`
- Aircraft/base/seat/category:
  - Base: `LAX`
  - Fleet: `350`
  - Position: `POS - B`
  - Pairing family: intentionally truncated DH + augmented Europe pairing
- Why this case matters:
  - gives the parser a realistic partial upload instead of a synthetic toy example
  - ideal for stress-testing missing terminal day/totals handling
  - matches real pilot behavior where a screenshot/paste may stop after the outbound or mid-pairing hotel row
- Proposed partial shape:
  - include header
  - include `A DH LAX-MSP`
  - include `B MSP-AMS`
  - stop after the `AMS 24.45/WILL ADVISE` row
  - omit return leg and final totals
- Expected parser risks:
  - missing total lines
  - no return-to-base
  - incomplete duty sequence
  - partial layover without closing duty-day context
- Recommended bucket: `partials`

## Candidate 5

- Fixture id: `lax-350-posb-dh-zero-max-edge-001`
- Source pairing number: `#A414`
- Aircraft/base/seat/category:
  - Base: `LAX`
  - Fleet: `350`
  - Position: `POS - B`
  - Pairing family: messy augmented edge case with DH placeholder maxima
- Why this case matters:
  - very similar to `#A413`, but with slightly different timing/equipment and `POS - B` only
  - useful for edge coverage without relying on a single canonical pairing
  - good candidate for verifying that small source variations do not break continuity or totals logic
- Expected parser risks:
  - `321` / `3N1` / `35J` mixed equipment markers across DH and operating rows
  - `0.00/0.00` FDP/max placeholders on DH rows
  - slightly different layover timing values from `#A413`
  - easy place for duplicated or mis-attached hotel/layover rows if source-order logic regresses
- Recommended bucket: `generated`

## Recommended first two fixtures to generate

1. `lax-350-aug-dh-ams-001`
   - highest parser-value case
   - best combined coverage for DH, augmented crews, layovers, totals, and 117-sensitive duty grouping

2. `lax-350-domestic-dh-control-001`
   - compact control fixture
   - fastest way to validate 350 parsing on a simpler same-day shape before the long-haul cases

## Suggested generation order after that

3. `lax-350-aug-cdg-001`
4. `lax-350-posb-dh-zero-max-edge-001`
5. `lax-350-aug-dh-ams-partial-001`

## Fixture pairing rule

Every generated MiCrew test input should have a matching expected JSON file.

Examples:

- `test/fixtures/rotations/micrew/generated/lax-350-aug-dh-ams-001.txt`
- `test/fixtures/rotations/expected/lax-350-aug-dh-ams-001.expected.json`

## Parser-change guardrail

If any of these generated fixtures fail current parsing or expose ambiguous behavior:

1. write the generated source fixture first
2. write the expected JSON from source evidence
3. run the harness
4. report expected vs actual
5. only then consider parser logic changes
