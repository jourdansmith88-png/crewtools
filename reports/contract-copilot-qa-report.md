# Contract Copilot QA Report

Generated: 2026-04-25T04:25:37.183Z

## Answer QA Summary

- PASS: 20
- WARN: 31
- FAIL: 4
- CRITICAL_FAIL: 0

## Support QA Summary

- PASS: 43
- WARN: 12
- FAIL: 0

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
| qa-cc-031 | PASS | WARN | document_section_explanation | false | PWA |
| qa-cc-032 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual |
| qa-cc-033 | PASS | WARN | document_section_explanation | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-034 | PASS | PASS | document_section_explanation | false | PWA, Scheduler Manual |
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

## Support Failures Grouped By Missing Anchor

- None

## Support Failures Grouped By Wrong Primary Section

- None

## Top 10 Missing Terms/Sections

- None

## Tests Where Answer Passed But Support Failed

- None

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

## Support-Failed Tests

- None