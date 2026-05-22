Transcribed from friend-provided MiCrew mobile screenshots into the normalized text format used by the fixture harness.

This case is an after-only/final fixture:
- `after.real.micrew.txt` is the normalized transcription
- `before.synthetic.micrew.txt` is intentionally left empty
- `expected.json` is parse-only and does not assert Trip Watch comparison behavior

Redaction:
- personal identifiers should remain `PPR REDACTED`

Confidently visible fields captured:
- rotation number `7804`
- base `SEA`
- trip dates `21MAY - 25MAY`
- report `1654 21MAY`
- release `1631 25MAY`
- credit `27:19`
- TAFB `95:37`
- layovers `DFW`, `PHX`, `SAT`, `SJC`
- totals `27:19TL 23:50BL 03:12CR 00:17MU`
- visible deadhead marker on `DL2208 PHX-MSP`

Uncertainty notes:
- the fixture is composed from two screenshots for the same rotation
- per-leg `Rpt-` lines were normalized from the visible departure cadence because the screenshots only show the trip-level report/release header
- the final visible leg is `SFO-SEA` while the preceding layover city shown is `SJC`; this likely reflects a Bay Area airport transfer or nearby-station presentation detail, but the fixture preserves the screenshot literally
- current MiCrew parser now carries the visible `D` marker on `DL2208 PHX-MSP` through as a deadhead annotation
- no synthetic baseline was created

Synthetic iCrew-style conversion added:
- `after.synthetic.icrew.txt`

This file is derived from the normalized MiCrew fixture and is intended only for copy/paste parser testing. It is not an official iCrew printout.
