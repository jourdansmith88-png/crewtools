# Calendar Sync Lab Test Checklist

## Setup

1. Load the app with `?rotationDebug=1`.
2. Load a baseline rotation.
3. Paste raw ICS into `Calendar Sync Lab`.
4. Click `Parse ICS`.
5. Click `Apply to loaded trip`.
6. Turn on `Use live projected timeline`.

## Verify

1. Parsed event count is shown.
2. Matched events are shown.
3. Same-airport/RTG candidates are shown.
4. Unmatched events are shown.
5. Ignored counts are shown.
6. Duty header projected values are shown.
7. Updated leg times are shown in the visible timeline.
8. Baseline times are shown as secondary details when times changed.
9. RTG event is inserted inline in the timeline.
10. Same-airport events do not produce a generic reroute warning.

## Privacy

- Do not commit `webcal://` or private calendar URLs.
- Treat raw ICS as private operational data.
- Do not store Delta credentials.

## Known 7707 Expected Result

- Matched `6`
- Same-airport/RTG `1`
- Unmatched `0`
- Timing-only `6`
- Structural `0`
- `DFW-DFW DL2798` inserted inline
