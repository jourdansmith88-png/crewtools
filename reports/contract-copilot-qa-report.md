# Contract Copilot QA Report

Generated: 2026-04-25T20:43:19.804Z

## Answer QA Summary

- PASS: 20
- WARN: 38
- FAIL: 13
- CRITICAL_FAIL: 0

## Support QA Summary

- PASS: 48
- WARN: 18
- FAIL: 5

## Per-Test Results

| ID | Answer Score | Support Score | Lane | AI | Sources |
| --- | --- | --- | --- | --- | --- |
| qa-cc-001 | PASS | PASS | direct_pay_rate_lookup | false | Compensation Manual |
| qa-cc-002 | PASS | PASS | direct_pay_rate_lookup | false | Compensation Manual |
| qa-cc-003 | PASS | PASS | apd_threshold_calculation | false | PWA |
| qa-cc-004 | PASS | PASS | direct_term_lookup | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-005 | PASS | WARN | document_section_explanation | false | PWA, Scheduler Manual |
| qa-cc-006 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-007 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-008 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-009 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-010 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-011 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-012 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-013 | PASS | PASS | direct_term_lookup | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-014 | PASS | PASS | direct_term_lookup | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-015 | PASS | PASS | direct_term_lookup | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-016 | PASS | PASS | direct_term_lookup | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-017 | PASS | PASS | direct_term_lookup | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-018 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-019 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-020 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-021 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-022 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-023 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-024 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-025 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-026 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-027 | PASS | PASS | apd_threshold_calculation | false | PWA |
| qa-cc-028 | PASS | PASS | apd_threshold_calculation | false | PWA |
| qa-cc-029 | FAIL | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-cc-030 | WARN | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-cc-031 | PASS | WARN | document_section_explanation | false | PWA, Scheduler Manual |
| qa-cc-032 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-033 | PASS | WARN | document_section_explanation | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-034 | PASS | PASS | document_section_explanation | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-035 | PASS | PASS | document_section_explanation | false | PWA, Scheduler Manual |
| qa-cc-036 | PASS | PASS | direct_pay_rate_lookup | false | Compensation Manual |
| qa-cc-037 | PASS | PASS | direct_pay_rate_lookup | false | Compensation Manual |
| qa-cc-038 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-039 | FAIL | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-040 | PASS | WARN | document_section_explanation | false | PWA, Scheduler Manual |
| qa-cc-041 | PASS | WARN | document_section_explanation | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-001 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-002 | WARN | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-003 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-004 | FAIL | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-005 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-006 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-007 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-008 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-009 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-010 | FAIL | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-golden-day-lc-001 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-wocl-8d3-001 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-011 | WARN | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-012 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-001 | WARN | FAIL | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-002 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-003 | FAIL | FAIL | clarification_needed | false | none |
| qa-rw-new-004 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-005 | FAIL | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-006 | FAIL | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-007 | FAIL | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-008 | FAIL | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-009 | FAIL | FAIL | clarification_needed | false | none |
| qa-rw-new-010 | WARN | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-011 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-012 | WARN | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-013 | FAIL | FAIL | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-014 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-015 | FAIL | FAIL | clarification_needed | false | none |
| qa-rw-new-016 | FAIL | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |

## Support Failures Grouped By Missing Anchor

- PWA | 7 | vacation | bank | replacement: 1
- PWA | 2 | rotation | break in duty | base: 1
- Scheduler Manual | open time | domicile layover | rotation: 1
- PWA | 14 F | sickness | notification | verification | lookback: 1
- PWA | 7 | vacation year | IVD | SUP: 1

## Support Failures Grouped By Wrong Primary Section

- None

## Top 10 Missing Terms/Sections

- PWA | 7 | vacation | bank | replacement: 1
- PWA | 2 | rotation | break in duty | base: 1
- Scheduler Manual | open time | domicile layover | rotation: 1
- PWA | 14 F | sickness | notification | verification | lookback: 1
- PWA | 7 | vacation year | IVD | SUP: 1

## Tests Where Answer Passed But Support Failed

- qa-rw-new-001: Can you swap with pot into a trip that exceeds your max p/up? Max p/up was 0.0 and swapped a one day trip for a two day trip.

## Failed Answer Tests

- qa-cc-029: Why was my APD denied if the counts were 18 required and 5 available?
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: topic_drift
- qa-cc-039: If I pick up a silver slip do I have to get above a certain amount above straight credit to get paid double? Similar to GS?
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none
- qa-rw-004: QS is supposed to call every pilot in category with a QS in right? Have blanket QS in. In middle of block of X days. No 30/168 or any other FAR restrictions. NYC 7ERA 0711 went out as QS at 0044. Phone never rang, no ARCOS email, notification, anything. Have been called for other QS, so I know my slip is active/ correct. Another NYC 7ERA who is on the same page of the wide report (so very similar seniority) also has blanket QS in, and didn't get a call for a QS he was eligible for as well.
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none
- qa-rw-010: One of my rotations changed for next month (not a carryover trip). Looks like they removed a leg and now it’s a redeye…am I due anything extra? There is a similar 4-day going out the next day, but reserve coverage won’t allow the swap. Can the CPO essentially override the rules to process for the occasion? Would this fall under known absence policies? If so, any pay protection? I know the other option *cough*
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: missing_source_warning, no_contract_reference
- qa-rw-new-003: My bank is full at 60 hours. I want to buy a vacation day for next year. Can I buy the vacation day and replace the 4:35 in the same month to keep the bank full? I tried this with the bank request and it says 4:35 requested and 0:00 awarded.
  - Score: FAIL
  - Lane: clarification_needed
  - Red flags: none
- qa-rw-new-005: After first airborne departure, Day 2 first flight is delayed and now we fly the same destination with a different scheduled flight number. Does this fall under reroute pay for this leg?
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none
- qa-rw-new-006: RRPay question. I am on reserve. I received the exact same RR on the last day two rotations in a row, but they paid different on my time card. Why? Both were ATL-SAV-ATL added to my last day and had about the same block time. The only difference was turn time. Rotations were on Apr 1 and Apr 17.
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none
- qa-rw-new-007: Can you move a reserve X-day between months if it adheres to the grouping restrictions? X-day on 28 Apr, reserve 29, 30, 01, 02. Can I swap the 28th and 2nd?
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none
- qa-rw-new-008: iCrew won't let me deposit 2 hours in my bank. Only thing I can think is the SS credit doesn't count. What don't I know?
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none
- qa-rw-new-009: Open Time Rotation built with domicile layover. Where is the reference that it is illegal? PWA Rotation definition states that release of a regular pilot for a break in duty at base will not end their rotation. Is there another reference that states the rotation is illegal if built with a domicile layover?
  - Score: FAIL
  - Lane: clarification_needed
  - Red flags: none
- qa-rw-new-013: Where can I find references that define medical procedures that do not count for sick lookback, and get smart on the approval process?
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none
- qa-rw-new-015: Trying to use SUP days from Mar 2027 to IVD next month, and I'm getting the 'Must be same Vacation year' message. Isn't March 2027 in the same Vacation year as May 2026?
  - Score: FAIL
  - Lane: clarification_needed
  - Red flags: none
- qa-rw-new-016: I was flying a four-day rotation for 21 hours that ended in JFK with a deadhead home the next day. On the last day, we were running about an hour late and MiCrew showed credit time 24:35 while the rotation showed 22:46. I intended to deviate deadhead and fly back to Atlanta same day, but because we were late I didn’t deviate and flew home on my scheduled flight. After the flight closed out, all credit times went back to 21 hours. Could the extra credit have been because the JFK layover became less than 13 hours? Why did it go back to 21?
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none

## Support-Failed Tests

- qa-rw-new-001: Can you swap with pot into a trip that exceeds your max p/up? Max p/up was 0.0 and swapped a one day trip for a two day trip.
  - Support score: FAIL
  - Support checks: supportAnchorMatch=pass, primarySupportMatch=fail, wrongSupportPenalty=pass
  - Missing anchors: none
  - Wrong primary: none
- qa-rw-new-003: My bank is full at 60 hours. I want to buy a vacation day for next year. Can I buy the vacation day and replace the 4:35 in the same month to keep the bank full? I tried this with the bank request and it says 4:35 requested and 0:00 awarded.
  - Support score: FAIL
  - Support checks: supportAnchorMatch=pass, primarySupportMatch=fail, wrongSupportPenalty=pass
  - Missing anchors: PWA | 7 | vacation | bank | replacement
  - Wrong primary: none
- qa-rw-new-009: Open Time Rotation built with domicile layover. Where is the reference that it is illegal? PWA Rotation definition states that release of a regular pilot for a break in duty at base will not end their rotation. Is there another reference that states the rotation is illegal if built with a domicile layover?
  - Support score: FAIL
  - Support checks: supportAnchorMatch=fail, primarySupportMatch=fail, wrongSupportPenalty=pass
  - Missing anchors: PWA | 2 | rotation | break in duty | base; Scheduler Manual | open time | domicile layover | rotation
  - Wrong primary: none
- qa-rw-new-013: Where can I find references that define medical procedures that do not count for sick lookback, and get smart on the approval process?
  - Support score: FAIL
  - Support checks: supportAnchorMatch=pass, primarySupportMatch=fail, wrongSupportPenalty=pass
  - Missing anchors: PWA | 14 F | sickness | notification | verification | lookback
  - Wrong primary: none
- qa-rw-new-015: Trying to use SUP days from Mar 2027 to IVD next month, and I'm getting the 'Must be same Vacation year' message. Isn't March 2027 in the same Vacation year as May 2026?
  - Support score: FAIL
  - Support checks: supportAnchorMatch=pass, primarySupportMatch=fail, wrongSupportPenalty=pass
  - Missing anchors: PWA | 7 | vacation year | IVD | SUP
  - Wrong primary: none