# Rotation Live State Model

This document describes a future live-state architecture for Rotation Companion.

It is a design/reference doc only.

This pass does not implement live mode.

## Goal

Rotation Companion currently works from a static imported trip snapshot:

- pasted MiCrew / iCrew text
- uploaded screenshots
- stitched screenshot-derived normalized text

Future live mode should let the app understand:

- what the rotation was originally supposed to be
- what the current working version of the trip is now
- what changed over time
- whether an event was a delay, return-to-gate, reroute, reassignment, or restoration

The model should support deterministic downstream tools:

- Rotation Dashboard
- reroute calculator
- pay impact tools
- contract support tools
- future logbook export

Without forcing AI to decide operational truth.

## Core Concepts

### 1. Original Snapshot

The original snapshot is the best-known planned version of the rotation before disruptions.

Example sources:

- imported MiCrew / iCrew trip text
- emailed rotation text
- first full screenshot set
- original pairing record

Suggested shape:

```ts
type RotationOriginalSnapshot = {
  snapshotId: string;
  capturedAt?: string;
  source: "micrew" | "icrew" | "email_rot" | "manual" | "mixed";
  rotationNumber?: string;
  tripDates?: {
    startDate?: string;
    endDate?: string;
  };
  report?: {
    time?: string;
    date?: string;
  };
  release?: {
    time?: string;
    date?: string;
  };
  totalCreditMinutes?: number;
  totalScheduledBlockMinutes?: number;
  tafbMinutes?: number;
  layovers: string[];
  legs: RotationLegSnapshot[];
  confidence: "high" | "medium" | "low";
};
```

Purpose:

- baseline for reroute and pay comparisons
- baseline for change detection
- baseline for contract calculations

### 2. Current Snapshot

The current snapshot is the best-known latest operational version of the trip.

It may differ from the original snapshot due to:

- delays
- cancellations
- deadheads
- return-to-gate events
- reroutes
- rejoin events
- restored original segments

Suggested shape:

```ts
type RotationCurrentSnapshot = {
  snapshotId: string;
  capturedAt?: string;
  source: "micrew" | "icrew" | "ops_update" | "manual" | "mixed";
  rotationNumber?: string;
  tripDates?: {
    startDate?: string;
    endDate?: string;
  };
  report?: {
    time?: string;
    date?: string;
  };
  release?: {
    time?: string;
    date?: string;
  };
  totalCreditMinutes?: number;
  totalScheduledBlockMinutes?: number;
  tafbMinutes?: number;
  layovers: string[];
  legs: RotationLegSnapshot[];
  confidence: "high" | "medium" | "low";
};
```

Purpose:

- current dashboard rendering
- current next-leg selection
- latest trip state for support tools

### 3. Change Events

A change event is the atomic record of how the trip changed.

Examples:

- departure delayed
- flight canceled
- reassigned to deadhead
- rerouted to a different city pair
- return to gate
- continuation after return to gate
- rejoined original rotation
- layover city changed

Suggested shape:

```ts
type RotationChangeEvent = {
  eventId: string;
  occurredAt?: string;
  eventType:
    | "delay"
    | "cancellation"
    | "deadhead_added"
    | "deadhead_removed"
    | "reroute"
    | "return_to_gate"
    | "continuation"
    | "rejoin_original_rotation"
    | "layover_change"
    | "release_change"
    | "unknown_change";
  dayNumber?: number;
  flightNumber?: string;
  fromLegId?: string;
  toLegId?: string;
  summary: string;
  source: "micrew" | "icrew" | "manual" | "derived";
  confidence: "high" | "medium" | "low";
  metadata?: Record<string, string | number | boolean | null>;
};
```

Purpose:

- explain why current differs from original
- drive pay/reroute tools
- create a readable trip change history

## Leg Model

The live model needs one shared leg representation for original/current snapshots and change detection.

Suggested shape:

```ts
type RotationLegSnapshot = {
  legId: string;
  dayNumber?: number;
  date?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  scheduledOut?: string;
  scheduledIn?: string;
  scheduledBlockMinutes?: number;
  actualOut?: string;
  actualIn?: string;
  actualBlockMinutes?: number;
  turnMinutes?: number;
  isDeadhead?: boolean;
  segmentType?: "operating" | "deadhead" | "return_to_gate" | "continuation" | "unknown_irregular";
  status?: "planned" | "current" | "completed" | "canceled" | "changed";
  gate?: string;
  equipmentShip?: string;
  confirmationNumber?: string;
  source?: string;
};
```

## Return-to-Gate Detection

Return-to-gate is a special irregular case and should be modeled explicitly.

### Operational pattern

Example:

- `DL2393 : RDU-RDU`
- followed by `DL2393 : RDU-BOS`

Interpretation:

- the first row may represent a push/depart/return event
- the second row may represent the continuation or reattempt

### Detection rules

Future live mode should classify a leg as `return_to_gate` when:

- `departureAirport === arrivalAirport`
- scheduled or actual block exists
- it is not explicitly a deadhead

It should classify the following leg as `continuation` when:

- adjacent row has the same flight number
- departure airport matches the return-to-gate airport
- the second row continues onward to a different arrival airport

### Important modeling rule

Do not collapse these into one leg automatically.

Preserve both:

- the return-to-gate segment
- the continuation segment

Why:

- reroute/pay tools may need to know both happened
- operational history matters
- current-flight state may depend on whether the aircraft returned before later continuation

## Reroute / Change History

Live mode should maintain a readable history, not just a latest snapshot.

Suggested shape:

```ts
type RotationChangeHistory = {
  originalSnapshot?: RotationOriginalSnapshot;
  currentSnapshot?: RotationCurrentSnapshot;
  events: RotationChangeEvent[];
};
```

This enables:

- “what changed?” explanations
- reroute pay calculations from event slices
- auditability for user trust

## Original vs Current Comparison

Future comparison logic should detect:

- unchanged legs
- replaced legs
- added legs
- removed legs
- restored original legs
- rejoin point

Suggested derived output:

```ts
type RotationComparison = {
  unchangedLegIds: string[];
  addedLegIds: string[];
  removedLegIds: string[];
  changedLegIds: string[];
  likelyRejoinLegIds: string[];
  warnings: string[];
};
```

This comparison should stay deterministic.

AI may assist extraction, but not the comparison decision itself.

## Snapshot Lifecycle

Suggested future flow:

1. Import original trip
2. Store as `originalSnapshot`
3. Import later screenshots / trip text
4. Build `currentSnapshot`
5. Compare original vs current
6. Emit `changeEvents`
7. Render dashboard from current snapshot
8. Feed reroute/pay tools from comparison + change events

## Live Mode State Layers

Future UI state should distinguish:

### Static imported state

- imported text
- imported screenshots
- extracted rows
- stitched chain

### Interpreted trip state

- original snapshot
- current snapshot
- comparison
- change events

### User-facing dashboard state

- rotation snapshot card
- next flight card
- layover/actions
- reroute entry points

This separation avoids mixing raw extraction artifacts into user-facing truth.

## Completeness

Future live mode should separate:

- rotation completeness
- duty/FAR completeness
- pay/reroute completeness

Examples:

- a full rotation can still have incomplete FAR 117 detail
- a full current snapshot can still have incomplete reroute pay evidence
- a partial screenshot import can still have enough data for next-flight display

Suggested shape:

```ts
type RotationCompleteness = {
  rotationCompleteness: "full" | "partial" | "unknown";
  dutyCompleteness: "complete" | "incomplete" | "unknown";
  rerouteCompleteness: "complete" | "incomplete" | "unknown";
  warnings: string[];
};
```

## Non-Goals For Initial Live Mode

The first live mode should not require:

- live aircraft tracking
- push notifications
- native device state
- automatic company-system syncing

It should work from imported operational artifacts first.

## Future Data Sources

Likely high-value future sources:

- MiCrew `EMAIL ROT`
- MiCrew calendar rotation detail
- MiCrew day-of-departure state
- iCrew rotation printout
- manual paste/corrections
- timecard pairing references

## Implementation Guidance

When live mode is built:

- keep OCR/extraction separate from state modeling
- keep original/current snapshots immutable once captured
- derive change events deterministically
- store return-to-gate and continuation legs explicitly
- avoid using user-facing dashboard state as the system of record

The system of record should be:

- original snapshot
- current snapshot
- change event history

