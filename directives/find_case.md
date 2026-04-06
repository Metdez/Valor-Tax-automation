# Find Case — IRS Logics API

## Overview
Look up case details by email or phone number.

## Authentication
Uses **HTTP Basic Auth** with public key as username and secret key as password.
- `IRS_LOGICS_PUBLIC_KEY` and `IRS_LOGICS_SECRET_KEY` stored in `.env`
- API key must have `case.read` permission.

---

## Find Case By Email

### Endpoint
**GET** `https://valortax.irslogics.com/publicapi/V4/Find/FindCaseByEmail?email={email}`

### Query Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| email | String | Email of the case to find | **required** |

---

## Find Case By Phone

### Endpoint
**GET** `https://valortax.irslogics.com/publicapi/V4/Find/FindCaseByPhone?phone={phone}`

### Query Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| phone | String | Phone number of the case to find | **required** |

## Response
Returns an array of matching cases in the `Data` field. Each case includes `CaseID`, `FirstName`, `LastName`, `Email`, `CellPhone`, `StatusID`, `SaleDate`, `CreatedDate`, etc.

```json
{
  "Data": [
    {"CaseID": 21611, "FirstName": "Zack", "LastName": "Hanna", "SaleDate": "2025-11-26T00:00:00", ...}
  ],
  "Success": true,
  "Message": "Data retrieved successfully.",
  "StatusCode": 200
}
```

## Edge Cases & Notes
- Parameters are **query params**, not headers (headers will return "Email/Phone is required" error).
- Both endpoints return an **array** of matching cases — multiple cases may share the same email or phone.
- When multiple cases are returned, prefer the one with a `SaleDate` (indicates an active client case vs. a test/duplicate).
- Phone format should match the format stored in IRS Logics (e.g., `(xxx)xxx-xxxx`).
- URL-encode the email/phone values in the query string.
