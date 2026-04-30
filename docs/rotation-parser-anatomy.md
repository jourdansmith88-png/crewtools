# Rotation Parser Anatomy

This document describes the two current rotation sources used by Rotation Companion parsing:

1. MiCrew mobile screenshots
2. iCrew rotation printouts

The goal is to preserve a clear parsing contract before expanding parser logic.

## MiCrew Mobile Screenshots

MiCrew mobile screenshots are card-based and usually show one or more visible flight cards plus layover/rest information. They are often partial because pilots cannot fit a full 3- or 4-day rotation in one screen.

### Typical flight card anatomy

Each visible leg usually contains:

- Flight card header
  - Examples:
    - `DL2502 : SLC-IAH`
    - `DL1532 : IAH-SLC`
    - `D DL833 : SLC-BUR`
  - Safe fields:
    - flight number
    - city pair
    - deadhead indicator when visible (`D`, airplane icon, or obvious deadhead text)

- Report / departure / arrival rows
  - Examples:
    - `Rpt- 0645 29APR`
    - `Dep- 0745 29APR`
    - `Arr- 1147 29APR +1hr`
    - `Dep- 1225 29APR`
    - `Arr- 1440 29APR -1hr`
  - Safe fields:
    - report time
    - scheduled departure
    - scheduled arrival
    - date suffix when visible
    - timezone offset marker like `+1hr` or `-1hr` as raw text

- Block / turn row
  - Examples:
    - `Blk- 3:02/Turn- 0:38`
    - `Blk- 3:15`
    - `Blk- 1:48`
  - Safe fields:
    - scheduled block
    - turn time when explicitly shown

- Gate rows
  - Examples:
    - `Gate- A40`
    - `Gate- A10`
    - second gate row for arrival or next segment context
  - Safe fields:
    - visible gate identifiers only

- Equipment / ship row
  - Example:
    - `Eqp/Ship- 221/8128`
  - Safe fields:
    - equipment code
    - ship number as raw text

- Confirmation number
  - Example:
    - `Confirmation #JLGDRW`
  - Safe fields:
    - confirmation code

### Layover / rest card anatomy

MiCrew screenshots often show a separate layover/rest card or a layover line between day segments.

- Examples:
  - `LAYOVER: SLC`
  - `LAYOVER: ATL`
  - `Rest- 14:47`
  - domicile/base rest wording when the screenshot clearly indicates the overnight happened back in base

- Safe fields:
  - layover city
  - visible rest duration
  - visible sequence order relative to nearby legs

### Safe MiCrew parsing rules

These are the fields that are generally safe to parse directly from MiCrew screenshots when visible:

- flight number
- deadhead vs flight when explicitly marked or strongly implied by the visible card
- departure airport
- arrival airport
- report time
- scheduled departure
- scheduled arrival
- scheduled block
- turn time
- gate
- equipment / ship
- confirmation number
- layover city
- rest duration

### Unsafe MiCrew assumptions

These should not be invented if they are not clearly visible:

- total trip credit
- total scheduled block for the whole rotation
- full duty period boundaries
- final release time for the full trip
- complete layover list when only one visible segment is shown
- whether the visible card is the full rotation or only a cropped slice

### Current MiCrew sample snippets

Examples taken from the current screenshot-driven reroute tests:

```text
D DL833 : SLC-BUR
Dep- 0715 28APR
Arr- 0916 28APR
Blk- 2:01

DL828 : BUR-SLC
Dep- 1030 28APR
Arr- 1218 28APR
Blk- 1:48

LAYOVER: SLC
Rest- 14:47

DL2502 : SLC-IAH
Rpt- 0645 29APR
Dep- 0745 29APR
Arr- 1147 29APR +1hr
Blk- 3:02/Turn- 0:38
Gate- A40
Gate- A10
Eqp/Ship- 221/8128
Confirmation #JLGDRW

DL1532 : IAH-SLC
Dep- 1225 29APR
Arr- 1440 29APR -1hr
Blk- 3:15
```

## iCrew Rotation Printout

iCrew printouts are table-based and usually contain much richer operational detail than MiCrew screenshots. They are better candidates for full-rotation parsing, but the parser must respect the actual column meanings.

## Official iCrew Rotation Display

Per the iCrew User's Guide Rotation Display reference, the standard rotation row header is:

```text
DAY FLT T DEPARTS ARRIVES C BLK TURN M EQP
```

Some real-world printouts may also include an optional `M/U` column, producing a variant like:

```text
DAY FLT T DEPARTS ARRIVES C BLK M/U TURN M EQP
```

The parser must support both variants.

Important implementation note:

- do not rely only on raw numeric token count
- detect column meaning from visible header structure and surrounding row shape
- if `M/U` is present, it is still not the turn column

### Correct meaning of DAY

The `DAY` column is not strictly numeric.

It may contain:

- numeric duty-day values such as `1`, `2`, `3`
- alphabetic sequence labels such as `A`, `B`, `C`, `D`

Important:

- a row beginning with `D` does **not** automatically mean deadhead
- only an explicit deadhead marker such as:
  - `DHD`
  - `DEADHEAD`
  - or another confirmed Delta deadhead label
  should mark the leg as deadhead

### Correct meaning of M

The `M` column is the meal column.

- an `*` in the `M` column means a meal will be served
- `M` must not be used as:
  - turn
  - deadhead logic
  - duty logic
  - pay logic

### Inbound segment marker

An `*` associated with the flight number means the flight has an inbound segment.

This should be stored only as metadata, for example:

- `hasInboundSegment: true`

It should not affect:

- turn logic
- FAR logic
- pay logic

by itself

### Rotation header

Common fields near the top:

- rotation number
- trip date range
- check-in / report time
- base or domicile
- credit / block summaries

Typical examples:

```text
ROTATION 4821
29APR-01MAY
CHECK-IN 0615
ACTUAL REPORT 0620
```

Safe fields:

- rotation number
- trip date range
- check-in time
- actual report time when explicitly labeled

### Main flight table

iCrew printouts commonly use a table like:

```text
DAY FLT T DEPARTS ARRIVES C BLK TURN M EQP
```

The important column meanings are:

- `DAY`
  - duty day label or sequence marker
- `FLT`
  - flight number
- `T`
  - type / deadhead marker / segment type
- `DEPARTS`
  - departure airport and time information
- `ARRIVES`
  - arrival airport and time information
- `C`
  - carrier or classification field when present
- `BLK`
  - scheduled block
- `TURN`
  - turn time
- `M/U`
  - optional makeup / adjustment column when present
- `M`
  - meal column
- `EQP`
  - equipment

### Important iCrew column rule

In iCrew printout rows:

- `BLK` is scheduled block
- `M/U` is makeup / adjustment and must **not** be treated as turn
- `TURN` is the actual turn field
- `M` is the meal field

This is a critical parser rule:

- values like `0.05` in the `M/U` column must **not** trigger tight-turn alerts
- only the real `TURN` column should drive turn-based trip intelligence

### Example row anatomy

Representative row examples:

```text
A 833 SLC 0715 BUR 0916 2:01 0:45 * 320
A 498 BUR 1015 ATL 1714 4:19 1:02 * 321
B 1682 ATL 0956 IAH 1109 * 2:13 0:05 1:16 * 321
B 1532 IAH 1225 SLC 1440 3:15 -- * 221
```

What is safe to parse from rows:

- day label
- flight number
- deadhead/type marker
- departure airport
- departure time
- arrival airport
- arrival time
- scheduled block from `BLK`
- makeup/adjustment from `M/U` only as a separate metadata field if needed later
- turn from `TURN`
- meal marker from `M` as metadata only
- equipment

Example interpretation:

```text
D1682 ATL 0956 IAH 1109 * 2.13 0.05 1.16 321
```

should become:

- flight number: `1682`
- departure airport: `ATL`
- scheduled out: `0956`
- arrival airport: `IAH`
- scheduled in: `1109`
- scheduled block: `2:13`
- make up: `0:05`
- turn: `1:16`
- equipment: `321`

The `0:05` value must not trigger a tight-turn alert.

### Layover / hotel / rest lines

iCrew printouts may include separate lines between duty periods such as:

```text
LAYOVER ATL
HOTEL WESTIN ATLANTA AIRPORT
REST 14:40
CONFIRMATION JLGDRW
```

or combined layover / lodging lines such as:

```text
IAH 11.49/CCA ATG BOOK ROOMS
AUS 15.08/CCA ATG BOOK ROOMS
```

Safe fields:

- layover city
- layover duration
- hotel text
- rest duration
- confirmation number

### FDP / legality lines

iCrew printouts may include lines like:

```text
PWA FDP 13:00
SKD MAX 12:30
ACT MAX 13:00
REST CLASS REDUCED
PAY REPORT TIME 0615
ACTUAL REPORT TIME 0620
LAST ACCLIMATED CITY SLC
```

Safe fields:

- PWA FDP value
- scheduled max
- actual max
- rest class
- pay report time
- actual report time
- last acclimated city

These are useful for future FAR 117 / planning-reference logic, but they must still be handled conservatively if the printout is partial.

Common duty/metadata line labels to treat conservatively:

- `PWA FDP/SKD MAX/ACT MAX`
- `REST CLASS-`
- `LAST ACCLIMATED CITY`
- `PAY REPORT TIME`
- `ACTUAL REPORT TIME`

### Safe iCrew parsing rules

Safe to parse directly when visible:

- rotation number
- date range
- report/check-in
- actual report
- row-level legs
- scheduled block from `BLK`
- turn from `TURN`
- layovers
- hotel/rest lines
- PWA FDP / SKD MAX / ACT MAX lines
- rest class
- pay report time
- actual report time
- last acclimated city

### Totals / metadata lines that are not flight legs

Examples:

```text
3.18BL
3.18TL
5.47BL
5.47TL
6.20DHD
10.15TL
REGULAR
RESERVE
TAFB
HOL
CARVE
SIT
EDP
```

These are totals, pay markers, or duty metadata.

They must not be parsed as:

- flight legs
- turn times
- route rows

They may be preserved as metadata if needed later, but they are not operational segment rows.

### Unsafe iCrew assumptions

Do not assume:

- the printout is complete if the first or last days are cropped
- missing totals can be reconstructed from visible rows unless all duty periods are present
- `M/U` is operational turn time
- a partial legality section is enough for a final FAR 117 conclusion

## Negative Classifier Example

Not every crew-related screenshot is a rotation display.

Example negative classifier:

- an iCrew bank / vacation / Green Slip / pay-management screenshot

Even if it contains crew-related labels, it should **not** trigger the rotation parser unless actual rotation-display markers are present, such as:

- rotation header
- row table header
- leg rows
- layover/rest trip structure

If those markers are absent, the screenshot should be treated as non-rotation content.

## Parsing Trust Principles

Both MiCrew and iCrew should follow the same trust rules:

- Parse visible operational facts first
- Preserve visible order from top to bottom
- Do not invent totals
- Mark partial rotations honestly
- Use only explicit turn fields for tight-turn logic
- Keep screenshot/image extraction separate from deterministic trip logic

## V1 Parser Implications

For Rotation Companion V1:

- MiCrew screenshot parsing can safely drive:
  - visible leg cards
  - layover/rest snippets
  - partial rotation banners
- iCrew printout parsing can safely drive:
  - richer leg-by-leg breakdown
  - better duty period reconstruction when complete
- FAR 117 should stay conservative unless:
  - report time
  - release time
  - leg sequence
  - duty structure
  are all sufficiently complete
