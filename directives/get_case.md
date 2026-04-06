# Get Case — IRS Logics API

## Overview
Retrieves case details by CaseID, with optional expanded fields.

## Endpoint
**GET** `https://valortax.irslogics.com/publicapi/V4/Case/CaseInfo?CaseID={id}`

## Authentication
Uses **HTTP Basic Auth** with public key as username and secret key as password.
- `IRS_LOGICS_PUBLIC_KEY` and `IRS_LOGICS_SECRET_KEY` stored in `.env`
- API key must have `case.read` permission.

## Query Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| CaseID | Integer | ID of the case to fetch | **required** |
| details | String | Comma-separated field names dynamically added to the response. Accepted: `setofficerid`, `attorneyid`, `casemanagerid`, `ctecid`, `caseworkerid`, `taxpreparerid`, `assignment1id`, `enrolledagentid`, `cpaid` | optional |
| udf | String | UDF value | optional |

## Response

Returns JSON containing major case properties. The property list in the `data` node grows over time — handle dynamically.

```json
{
  "Success": true,
  "data": {
    "CaseID": 128346,
    "FirstName": "first name",
    "LastName": "last name",
    "DOB": "07/24/1995",
    "Status": 1,
    "SaleDate": null,
    "CellPhone": "",
    "HomePhone": "",
    "WorkPhone": "",
    "Email": "test@test.com",
    "City": "",
    "State": ""
  }
}
```

## Edge Cases & Notes
- The `data` property list changes over time — do not hardcode expected fields.
- Use `details` to include assignment IDs (e.g., `setofficerid,attorneyid`) in the response.
