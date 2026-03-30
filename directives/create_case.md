# Create Case — IRS Logics API

## Overview
Creates a case with default values in IRS Logics.

## Endpoint
**POST** `https://valortax.irslogics.com/publicapi/V4/Case/CaseFile`

## Authentication
Uses **HTTP Basic Auth** with public key as username and secret key as password.
- `IRS_LOGICS_PUBLIC_KEY` and `IRS_LOGICS_SECRET_KEY` stored in `.env`
- API key must have `case.write` permission.

## Request Body

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| LastName | String | Last Name | **required** |
| StatusID | Integer | Status assigned to the case | optional |
| ProductID | Integer | Product the case belongs to (e.g., `1` for TR Case) | optional |
| FirstName | String | First Name | optional |
| Email | String | Email | optional |
| CellPhone | String | Cell Phone. Format: `(xxx)xxx-xxxx` | optional |
| WorkPhone | String | Work Phone. Format: `(xxx)xxx-xxxx` | optional |
| HomePhone | String | Home Phone. Format: `(xxx)xxx-xxxx` | optional |
| State | String | 2-character state code (e.g., `CA`, `NY`) | optional |
| City | String | City | optional |
| Zip | String | Zip Code | optional |
| Address | String | Address | optional |
| AptNo | String | Apartment Number | optional |
| SSN | String | SSN. Format: `xxx-xx-xxxx` | optional |
| Marital_Status | String | Accepted: `single`, `married filing jointly`, `married filing separately`, `head of household`, `qualifying widow(er)` | optional |
| TAX_RELIEF_TAX_AGENCY | String | Agency for tax support. Comma-separated. Accepted: `FEDERAL`, `STATE` | optional |
| TAX_RELIEF_TAX_AMOUNT | String | Tax relief amount requested | optional |
| Opener | String | Opener | optional |
| CPA/Attorney/EA | String | CPA/Attorney/EA | optional |
| Set. Officer | String | Set. Officer | optional |
| Tax Preparer | String | Tax Preparer | optional |
| Language | String | Language | optional |
| Notes | String | Notes | optional |
| UDF | Array | UDF Fields. e.g., `[{"UDFName1":"UDFValue1"}]` | optional |
| DistributionId | Integer | Lead Distribution Id. e.g., `2` | optional |
| TaxProblem | String | Accepted: `ACCOUNTING`, `ASSETS_SEIZED`, `BANK_ACCOUNT_LEVY`, `CANT_PAY_UNPAID_TAXES`, `INNOCENT_SPOUSE`, `License_Suspension_Revocation`, `LIEN_FILED`, `Passport_Suspension_Revocation`, `RECEIVED_AUDIT_NOTICE`, `UNPAID_PENALTIES_AND_INTEREST`, `WAGE_GARNISHMENT`, `RECEIVED_IRS_LETTER`, `ISSUE_CLAIMING_DEPENDENTS`, `ID_THEFT`, `IRS_REFUND`, `OTHER` | optional |
| TAX_RELIEF_TAX_TYPE | String | Accepted: `Personal`, `Business`, `Personal and Business`, `Payrol and Other` | optional |
| DOB | DateTime | Date of Birth. Format: `MM/dd/yyyy` | optional |
| SourceName | String | Source Name | optional |
| BusinessType | String | Accepted: `sole proprietorship`, `partnership`, `llp`, `llc (single)`, `llc (multiple)`, `s corp`, `c corp`, `trust` | optional |
| BusinessName | String | Business Name | optional |
| BusinessAddress | String | Business Address | optional |
| BusinessAptNo | String | Business Apartment Number | optional |
| BusinessCity | String | Business City | optional |
| BusinessState | String | 2-character state code (e.g., `CA`, `NY`) | optional |
| BusinessZip | String | Business Zip Code | optional |
| EIN | String | Employer ID Number | optional |
| SMSPermit | Bool | Opt-in SMS | optional |
| DuplicateCheck | String | Comma-separated fields to check duplication. Fields: `FirstName`, `LastName`, `MiddleName`, `DOB`, `Email`, `SSN`, `CellPhone`, `WorkPhone`, `HomePhone`, `BusinessName`, `EIN`, `Phones` | optional |

## Response

Returns JSON with the created `CaseID`. Store this for further reference.

```json
{
  "Success": true,
  "data": {"CaseID": 344685},
  "message": "Case created successfully by User: Frankie Smith",
  "StatusCode": 200,
  "Timestamp": "2025-05-16T11:18:18.7777777Z"
}
```

## Edge Cases & Notes
- `LastName` is the only required field.
- Phone formats must be `(xxx)xxx-xxxx`.
- SSN format must be `xxx-xx-xxxx`.
- DOB format must be `MM/dd/yyyy`.
- State fields must be exactly 2 characters.
- Multiple tax agencies can be comma-separated.
- `DuplicateCheck` does not prevent creation — it flags duplicates.
