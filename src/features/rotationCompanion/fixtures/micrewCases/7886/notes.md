Source: friend-provided MiCrew screenshot.

Fixture type:
- after-only / final-flown MiCrew fixture
- no synthetic baseline created yet

Confidently transcribed fields:
- rotation number `7886`
- base `SLC`
- trip dates `27MAY - 29MAY`
- trip-level report/release
- credit `15:47`
- TAFB `48:34`
- layover `PSC`
- all six visible legs
- totals `15:47TL 11:33BL 04:14CR 00:00MU`

Deadhead note:
- the final visible leg is marked `D DL1024 FCA-SLC 1220-1404`
- current MiCrew normalization preserves that as a deadhead leg, so this fixture expects:
  - deadhead leg count `1`
  - operating leg count `5`
  - deadhead block `1:44`

Normalization note:
- the screenshot is a compact mobile MiCrew view, so the fixture uses the existing normalized parser-fixture shape:
  - `DL#### : ORG-DST`
  - `Rpt- / Dep- / Arr- / Blk- / Eqp/Ship-`
- per-leg `Rpt-` values are inferred from the visible sequence cadence and should be treated as parser-fixture scaffolding, not authoritative source values

Uncertain or unavailable:
- no additional layover transport details beyond the visible hotel line
- no before/original schedule

Synthetic iCrew-style conversion added:
- `after.synthetic.icrew.txt`

This file is derived from the normalized MiCrew fixture and is intended only for copy/paste parser testing. It is not an official iCrew printout.
