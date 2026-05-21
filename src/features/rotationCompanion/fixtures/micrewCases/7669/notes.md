Transcribed from friend-provided MiCrew mobile screenshots into the normalized text format used by the fixture harness.

This case currently ships as an after/final-only fixture:
- `after.real.micrew.txt` is the normalized transcription
- `before.synthetic.micrew.txt` is intentionally left empty for now
- `expected.json` is parse-only and does not assert Trip Watch comparison behavior yet

Redaction:
- personal identifiers should remain `PPR REDACTED`

Notes:
- hotel names and phone numbers are included for future layover/utility fixture coverage, even though the current harness only asserts the trip-shape fields
- this case now asserts the authoritative MiCrew `TOTALS 16:56TL 16:48BL 00:00CR 00:08MU` line for total scheduled block instead of the visible-leg sum
