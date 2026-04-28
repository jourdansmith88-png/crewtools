# Contract Copilot QA Report

Generated: 2026-04-27T15:50:37.161Z

## Answer QA Summary

- PASS: 20
- WARN: 75
- FAIL: 2
- CRITICAL_FAIL: 0

## Support QA Summary

- PASS: 77
- WARN: 19
- FAIL: 1

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
| qa-cc-029 | WARN | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-cc-030 | WARN | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-cc-031 | PASS | WARN | document_section_explanation | false | PWA, Scheduler Manual |
| qa-cc-032 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-033 | PASS | WARN | document_section_explanation | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-034 | PASS | PASS | document_section_explanation | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-035 | PASS | PASS | document_section_explanation | false | PWA, Scheduler Manual |
| qa-cc-036 | PASS | PASS | direct_pay_rate_lookup | false | Compensation Manual |
| qa-cc-037 | PASS | PASS | direct_pay_rate_lookup | false | Compensation Manual |
| qa-cc-038 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-039 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-cc-040 | PASS | WARN | document_section_explanation | false | PWA, Scheduler Manual |
| qa-cc-041 | PASS | WARN | document_section_explanation | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-001 | FAIL | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-002 | WARN | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-003 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-004 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-005 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-006 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-007 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-008 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-009 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-010 | WARN | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-golden-day-lc-001 | FAIL | FAIL | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-wocl-8d3-001 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-011 | WARN | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-012 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-shortcall-notification-001 | WARN | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-oe-notification-001 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-001 | WARN | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-002 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-003 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-004 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-005 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-006 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-007 | WARN | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-008 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-009 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-010 | WARN | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-011 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-012 | WARN | WARN | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-013 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-014 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-new-015 | WARN | PASS | contract_scenario_retrieval | false | PWA, Scheduler Manual |
| qa-rw-new-016 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-001 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-002 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-003 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-004 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-005 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-006 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-007 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-008 | WARN | PASS | direct_term_lookup | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-009 | WARN | PASS | document_section_explanation | false | PWA |
| qa-rw-batch2-010 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-011 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-012 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-013 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-014 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-015 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-016 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-017 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-018 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-019 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-batch2-020 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-regression-thread-isolation-001 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-regression-thread-isolation-002 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-regression-paycredit-subscenario-001 | WARN | WARN | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |
| qa-rw-regression-paycredit-subscenario-002 | WARN | PASS | contract_scenario_retrieval | false | PWA, Compensation Manual, Scheduler Manual |

## Support Failures Grouped By Missing Anchor

- PWA | 2 A.129 | golden day | hard non-fly day: 1

## Support Failures Grouped By Wrong Primary Section

- None

## Top 10 Missing Terms/Sections

- PWA | 2 A.129 | golden day | hard non-fly day: 1

## Tests Where Answer Passed But Support Failed

- None

## Failed Answer Tests

- qa-rw-001: Hey gang! Picked up a 2-day QS on 22 April, originally ending with a DH back to ATL on 23 April. Was rerouted prior to DH (ACARS notification) for an LAX-SFO-LAX turn, then layover and DH home on 24 April (now a 3-day trip). Upon award, my PB days were applied to 24-25 April for my 2 interrupted X-days and a little bit of a PR on the 26th. CS has converted by PB back to LC on the 24th (totes legit) however my PB day didn’t get re-applied to a later date (should be Sunday?). I revert to LC upon release and now only show a PR on the 26th. When awarded, I had two full PBs plus my PR remainder. Now I have less even though I flew more and had more impact on my X-days due to the reroute. Called CS and they were polite and stated the “system” might just be behind and to submit a DART. Obviously less than ideal since the (perceived?) infraction will come and go prior to any resolution if they get it wrong. I’m seldom correct on these things so just wanted a sanity check before I confuse. TYIA. FWIW - also did not receive any notification (robot or human) for this trip award again so doesn’t look like that is fixed.
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none
- qa-rw-golden-day-lc-001: golden day before first LC... golden day is defined as a hard non-fly day (PWA Section 2 A.129.) doesn't that mean you can't be assigned anything earlier than 6pm day one of LC? Or Day before worthless
  - Score: FAIL
  - Lane: contract_scenario_retrieval
  - Red flags: none

## Support-Failed Tests

- qa-rw-golden-day-lc-001: golden day before first LC... golden day is defined as a hard non-fly day (PWA Section 2 A.129.) doesn't that mean you can't be assigned anything earlier than 6pm day one of LC? Or Day before worthless
  - Support score: FAIL
  - Support checks: supportAnchorMatch=fail, primarySupportMatch=fail, wrongSupportPenalty=pass
  - Missing anchors: PWA | 2 A.129 | golden day | hard non-fly day
  - Wrong primary: none