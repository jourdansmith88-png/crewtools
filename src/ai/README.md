# CrewTools AI Foundation

This folder is the shared AI foundation for CrewTools. It is intentionally narrow:

- one shared AI core
- multiple workflow-specific orchestration layers
- deterministic app logic stays outside the AI layer

## Design rules

AI is responsible for:
- language understanding
- extraction
- summary/explanation drafting
- ambiguity detection

Deterministic app logic is responsible for:
- contract rule evaluation
- pay math
- trip valuation
- timecard calculations
- bid file generation

## Workflow pattern

Each workflow follows the same structure:

1. `input schema`
2. `context builder`
3. `system prompt`
4. `output schema`
5. `post-processing`

## Supplemental external grounding

External search is optional and always secondary to internal sources.

Source priority:

1. `PWA`
2. `Scheduler Manual`
3. `CrewTools Logic`
4. `Web Discussion`
5. `Forum / Unofficial`
6. model reasoning

Use external grounding only when:
- internal support is weak or incomplete
- interpretation or practice context would help
- terminology needs clarification
- an edge case would benefit from supplemental examples

External snippets may explain or illustrate common interpretations, but they never override governing contract text.

## Recommended API route strategy

Use a shared internal runner with thin workflow-specific routes.

Recommended later shape:

- `app/api/ai/contract-copilot/route.ts`
- `app/api/ai/trip-parser/route.ts`
- `app/api/ai/timecard-parser/route.ts`
- `app/api/ai/pay-audit/route.ts`
- `app/api/ai/pbs-builder/route.ts`

Each route should:
- validate request input
- call `runAIWorkflow(...)`
- return the structured result

This keeps routing explicit for each tool while reusing one model client, one runner, one validation pattern, and one logging/error model.
