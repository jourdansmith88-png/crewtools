Transcribed from a friend-provided MiCrew mobile screenshot into the normalized text format used by the fixture harness.

This case is an after-only/final fixture:
- `after.real.micrew.txt` is the normalized transcription
- `before.synthetic.micrew.txt` is intentionally left empty
- `expected.json` is parse-only and does not assert Trip Watch comparison behavior

Redaction:
- personal identifiers should remain `PPR REDACTED`

Confidently visible fields captured:
- rotation number `7689-2`
- base `SLC`
- trip dates `25APR - 27APR`
- report `0650 25APR`
- release `1030 27APR`
- credit `15:45`
- TAFB `51:52`
- layovers `LGA`, `ORD`
- totals `15:45TL 10:16BL 04:37CR 00:52MU`
- visible `D` markers on `DL720 SLC-AUS` and `DL9967 BOS-LGA`

Known parser/UI notes:
- this fixture preserves both visible `D` markers and expects those two legs to remain deadheads
- the visible totals line is treated as authoritative for trip block

Uncertainty notes:
- per-leg `Rpt-` lines were normalized from the visible departure cadence because the screenshot only shows the trip-level report/release header
- no synthetic baseline was created

Synthetic iCrew-style conversion added:
- `after.synthetic.icrew.txt`

This file is derived from the normalized MiCrew fixture and is intended only for copy/paste parser testing. It is not an official iCrew printout.

Synthetic iCrew note:
- the smoke file keeps the source case identifier `7689-2` in the synthetic notes, but uses numeric header rotation `7689` so the iCrew parser can ingest it cleanly
- both visible deadheads are represented in iCrew-style form with day-level `DHD` lines:
  - `D DL720 SLC-AUS`
  - `D DL9967 BOS-LGA`
