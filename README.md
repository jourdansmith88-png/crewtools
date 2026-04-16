# CrewTools

CrewTools is a mobile-first pilot toolkit concept that combines three common Delta pilot workflows into one app:

- schedule and pairing health checks inspired by John Bell tools
- pay audit calculations inspired by WidgetCrew
- seniority and base/equipment comparison inspired by WidgetSeniority

## What is in this first pass

- a single-screen Expo app with a polished mobile dashboard
- a schedule analyzer for productivity, fatigue, and trip complexity
- a pay audit form for base pay, premium pay, per diem, and missed break pay
- a seniority explorer with sample base and equipment data

## Run locally

```bash
npm install
npm start
```

Then open the Expo QR code on iPhone or Android.

## Parse Delta PDF data

Place source PDFs in:

- `/Users/StarJ/Desktop/Senority+/Delta data/Seniority lists`
- `/Users/StarJ/Desktop/Senority+/Delta data/Category Lists`
- `/Users/StarJ/Desktop/Senority+/Delta data/AE`

Then run:

```bash
npm run parse:delta
```

For the normal monthly update flow, after you drop in a new Seniority list or AE posting, run:

```bash
npm run refresh:delta
```

That will:

- parse the newest Delta PDFs
- rebuild the web app with the latest data

This writes normalized JSON files into:

`/Users/StarJ/Desktop/Senority+/Delta data/parsed`

## Suggested next steps

1. Replace the sample seniority dataset with real Delta-specific import data.
2. Add authentication and securely connect to any user-owned data sources.
3. Split the app into routed screens and persist pilot preferences.
4. Add contractual rule calculators for reroute, breakage, and pay protection.

## Notes

This version does not scrape or log into any third-party site. It is a clean product prototype built around the workflows those sites support.

Typical update cadence:

- Seniority lists: beginning of the month
- AE postings: usually mid-month
