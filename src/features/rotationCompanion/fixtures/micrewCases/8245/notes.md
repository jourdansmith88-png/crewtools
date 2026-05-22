Transcribed from a friend-provided MiCrew mobile screenshot into the normalized text format used by the fixture harness.

This case is an after-only/final fixture:
- `after.real.micrew.txt` is the normalized transcription
- `before.synthetic.micrew.txt` is intentionally left empty
- `expected.json` is parse-only and does not assert Trip Watch comparison behavior

Redaction:
- personal identifiers should remain `PPR REDACTED`

Confidently visible fields captured:
- rotation number `8245`
- base `SEA`
- trip dates `06MAY - 10MAY`
- report `0859 06MAY`
- release `0630 10MAY`
- credit `27:17`
- TAFB `94:03`
- layovers `GEG`, `PHX`, `FAI`
- totals `27:17TL 22:15BL 03:44CR 01:18MU`
- final visible arrival `SEA`

Known parser gap:
- the screenshot includes `O OO3857 GEG-SEA 1745-1859 ES4`
- this offline/regional row is preserved faithfully in the transcription
- current MiCrew parser now preserves that row as `OO3857` and classifies it as a deadhead leg
- the fixture asserts the trip shape plus the deadhead accounting implied by that preserved regional carrier row

Uncertainty notes:
- per-leg `Rpt-` lines were normalized from the visible departure cadence because the screenshot only shows the trip-level report/release header
- no synthetic baseline was created

Synthetic iCrew-style conversion added:
- `after.synthetic.icrew.txt`

This file is derived from the normalized MiCrew fixture and is intended only for copy/paste parser testing. It is not an official iCrew printout.
