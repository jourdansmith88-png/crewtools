Transcribed from a friend-provided MiCrew mobile screenshot into the normalized text format used by the fixture harness.

This case is an after-only/final fixture:
- `after.real.micrew.txt` is the normalized transcription
- `before.synthetic.micrew.txt` is intentionally left empty
- `expected.json` is parse-only and does not assert Trip Watch comparison behavior

Redaction:
- personal identifiers should remain `PPR REDACTED`

Confidently visible fields captured:
- rotation number `4501`
- base `SLC`
- trip dates `14MAY - 17MAY`
- report `0702 14MAY`
- release `1047 17MAY`
- credit `21:42`
- TAFB `75:58`
- layovers `AUS`, `LGA`, `JFK`
- totals `21:42TL 19:57BL 00:10CR 01:35MU`

Uncertainty notes:
- per-leg `Rpt-` lines were normalized from the visible departure cadence because MiCrew only shows the trip report/release header on the screenshot
- no synthetic baseline was created
- no deadhead marker is visible on this screenshot
