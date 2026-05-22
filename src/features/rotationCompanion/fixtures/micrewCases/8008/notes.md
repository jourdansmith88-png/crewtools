`after.real.micrew.txt` is the first normalized MiCrew screenshot transcription in the new fixture harness.

This case is intentionally conservative:
- `PPR REDACTED` is used in place of any personal ID.
- the `before.synthetic.micrew.txt` file is a synthetic baseline created by removing the final recovery leg from the flown/final snapshot.
- the synthetic baseline is not treated as an official original schedule; it only exists to create a repeatable compare harness path.

Current parser expectations for this first case:
- MiCrew mobile parser path
- 4 parsed operating legs
- 1 layover city (`MKE`)
- trip compare should surface a schedule/pay watch change because the synthetic baseline is shorter than the final/flown after state

Synthetic iCrew-style conversion added:
- `after.synthetic.icrew.txt`

This file is derived from the normalized MiCrew fixture and is intended only for copy/paste parser testing. It is not an official iCrew printout.
