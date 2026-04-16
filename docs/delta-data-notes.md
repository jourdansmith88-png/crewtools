# Delta Data Notes

The Delta import pipeline currently expects PDFs in:

- `/Users/StarJ/Desktop/Senority+/Delta data/Seniority lists`
- `/Users/StarJ/Desktop/Senority+/Delta data/Category Lists`
- `/Users/StarJ/Desktop/Senority+/Delta data/AE`

The parser script is:

- `/Users/StarJ/Desktop/Senority+/scripts/parse-delta-data.mjs`

It produces JSON outputs in:

- `/Users/StarJ/Desktop/Senority+/Delta data/parsed`

## Current document types

### Seniority lists

Fields extracted:

- seniority number
- employee number
- pilot name
- category code
- hire date
- scheduled retirement date

### Category lists

Fields extracted:

- sequence
- seniority number
- employee number
- pilot name
- base
- fleet
- position code
- instructor flag

### AE postings

Fields extracted:

- award date
- award type
- award category
- employee number
- pilot name
- seniority number
- conv out of sequence flag
- previous category
- bypass award flag
- projected training month when present
- pay protection date when present
- outside hours verification flag

## Next app use

These parsed files give us enough structure to build:

- current holdability views by base, fleet, and seat
- movement history month over month
- AE vacancy heatmaps and opportunity tracking
- personal seniority comparisons against live categories
