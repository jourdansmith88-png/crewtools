# Google Sheets Beta Feedback Webhook

This is the simplest way to make `BETA_FEEDBACK_WEBHOOK_URL` work without building a backend.

## What this does

When a beta tester submits the feedback form on CrewTools, the app sends JSON to a Google Apps Script webhook. The webhook writes each entry into a Google Sheet.

## 1. Create the Google Sheet

1. Go to Google Sheets.
2. Create a new blank spreadsheet.
3. Name it something like `CrewTools Beta Feedback`.

## 2. Open Apps Script

1. In the sheet, click `Extensions`.
2. Click `Apps Script`.
3. Delete any starter code in the editor.
4. Paste in the contents of:

`landing/google-apps-script/beta-feedback-webhook.gs`

## 3. Deploy the script as a Web App

1. Click `Deploy`.
2. Click `New deployment`.
3. For deployment type, choose `Web app`.
4. Set:
   - `Execute as`: `Me`
   - `Who has access`: `Anyone`
5. Click `Deploy`.
6. Google will ask for authorization.
7. Approve the script.
8. Copy the `Web app URL`.

That URL is your `BETA_FEEDBACK_WEBHOOK_URL`.

## 4. Add the webhook to Vercel

1. Open your `crewtools` project in Vercel.
2. Go to `Settings` -> `Environment Variables`.
3. Add:

   - Key: `BETA_FEEDBACK_WEBHOOK_URL`
   - Value: paste the Google Apps Script Web app URL

4. Save.
5. Redeploy the project.

## 5. Test it

1. Open `https://crewtools.app/beta`
2. Submit the feedback form.
3. Go back to the Google Sheet.
4. You should see a new row appear.

## Data CrewTools sends

The app sends this JSON shape:

```json
{
  "name": "Pilot Name",
  "email": "pilot@example.com",
  "category": "Bug",
  "message": "What happened and what I expected instead.",
  "source": "crewtools-beta",
  "createdAt": "2026-04-16T00:00:00.000Z"
}
```

## If it does not work

Check these first:

1. The Apps Script was deployed as a `Web app`, not just saved.
2. Access is set to `Anyone`.
3. The exact deployed `Web app URL` is pasted into Vercel.
4. You redeployed Vercel after adding the environment variable.
5. Your Google Sheet tab is named `Beta Feedback`, or let the script create it automatically.
