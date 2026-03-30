# GHL Appointment → IRS Logics Case (Auto-Sync)

## Overview
When a new appointment is booked in GoHighLevel, automatically create a case in IRS Logics with the contact's data.

## Architecture
```
GHL Appointment Booked
  → GHL Workflow (Outbound Webhook)
    → Vercel Serverless Function (/api/ghl-webhook)
      → IRS Logics V4 API (Create Case)
```

## Field Mapping

| GHL Field | IRS Logics Field | Notes |
|-----------|-----------------|-------|
| `last_name` | `LastName` | **Required** — falls back to `full_name` then `"Unknown"` |
| `first_name` | `FirstName` | |
| `email` | `Email` | |
| `phone` | `CellPhone` | Reformatted to `(xxx)xxx-xxxx` |
| `address1` | `Address` | |
| `city` | `City` | |
| `state` | `State` | Must be 2-char code |
| `postal_code` | `Zip` | |
| `date_of_birth` | `DOB` | Reformatted to `MM/dd/yyyy` |
| `company_name` | `BusinessName` | |
| `contact_source` | `SourceName` | |
| `calendar.notes` | `Notes` | Appointment notes |

## Duplicate Checking
Every request includes `DuplicateCheck: "FirstName,LastName,Email,CellPhone"`.
Note: IRS Logics flags duplicates but still creates the case.

## Deployment (Vercel)

### 1. Deploy
```bash
cd vercel-webhook
npm install
npx vercel --prod
```

### 2. Set Environment Variables in Vercel
```
IRS_LOGICS_PUBLIC_KEY=<from .env>
IRS_LOGICS_SECRET_KEY=<from .env>
```
Set via: Vercel Dashboard → Project → Settings → Environment Variables
Or via CLI: `vercel env add IRS_LOGICS_PUBLIC_KEY`

### 3. Get Your Webhook URL
After deploy, your endpoint will be:
```
https://<your-project>.vercel.app/api/ghl-webhook
```

### 4. Set Up GHL Workflow
1. Go to **Automation → Workflows** in your GHL sub-account
2. Create new workflow
3. **Trigger:** "Appointment Booked" (or "Appointment Status" if you want updates too)
4. **Action:** "Webhook (Outbound)"
5. **URL:** Paste your Vercel endpoint URL
6. **Method:** POST
7. Save and publish the workflow

## Testing
Send a test POST to verify:
```bash
curl -X POST https://<your-project>.vercel.app/api/ghl-webhook \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Test","last_name":"User","email":"test@example.com","phone":"5551234567"}'
```

## Edge Cases & Notes
- If `last_name` is missing, falls back to `full_name`, then `"Unknown"`
- Phone numbers with country code (1+10 digits) are handled
- Invalid phone formats are skipped (field omitted)
- Invalid DOB formats are skipped
- State must be exactly 2 characters or it's skipped
- GHL Workflow webhooks include all contact fields automatically — no second API call needed

## Environment Variables
| Variable | Purpose |
|----------|---------|
| `IRS_LOGICS_PUBLIC_KEY` | Basic Auth username for IRS Logics API |
| `IRS_LOGICS_SECRET_KEY` | Basic Auth password for IRS Logics API |
| `GHL_API_KEY` | GHL API token (for future direct API calls) |
| `GHL_LOCATION_ID` | GHL location/sub-account ID |
