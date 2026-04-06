# Create Task/Event — IRS Logics API

## Overview
Creates a Task or Event on a case. Tasks have only a Due Date; Events also require an EndDate. All datetimes must be passed as **UTC**.

## Endpoint
**POST** `https://valortax.irslogics.com/publicapi/V4/Task/Task`

## Authentication
Uses **HTTP Basic Auth** with public key as username and secret key as password.
- `IRS_LOGICS_PUBLIC_KEY` and `IRS_LOGICS_SECRET_KEY` stored in `.env`
- API key must have `task.write` permission.

## Request Body

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| CaseID | Integer | Case to which the task is added | **required** |
| Subject | String | Subject | **required** |
| Reminder | DateTime | Reminder time (UTC) | **required** |
| TaskType | Integer | `1` = Task, `2` = Event | **required** |
| DueDate | DateTime | Task due date (UTC) | **required** |
| UserID | Array | Array of User IDs | **required** |
| EndDate | DateTime | Task/Event end date (UTC). **Required if TaskType = 2** | optional |
| PriorityID | Integer | `0` = Normal, `1` = Medium, `2` = High, `3` = Urgent | optional |
| StatusID | Integer | `0` = Incomplete, `1` = Complete | optional |
| TaskCategoryID | Integer | Category ID | optional |
| Comments | String | Comments | optional |
| AllDayEvent | Boolean | Is all-day event | optional |

## Response

Returns JSON with the created `TaskID`. Store this for further reference.

```json
{
  "Success": true,
  "data": {"TaskID": 128346},
  "message": "Task/Event created successfully by User: Frankie Smith",
  "StatusCode": 201,
  "Timestamp": "2025-05-30T00:00:00.0000000Z"
}
```

## Edge Cases & Notes
- If `TaskType` is `2` (Event), `EndDate` is **required**.
- All datetimes must be UTC.
- `StatusID = 1` marks complete, `StatusID = 0` marks incomplete.
- `PriorityID` values: `0` Normal, `1` Medium, `2` High, `3` Urgent.
