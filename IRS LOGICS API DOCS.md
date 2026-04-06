IRS LOGICS API Documentation  
Overview  
The IRS LOGICS Public API uses Basic Authentication to secure all requests. Include your API key in the Authorization header for every request. Base URL: [https://valortax.irslogics.com/publicapi/V4/](https://valortax.irslogics.com/publicapi/V4/)

═══════════════════════════════  
AUTHENTICATION  
═══════════════════════════════  
All endpoints require: Authorization: Basic \[base64\_encoded\_api\_key\]

═══════════════════════════════  
APPOINTMENT ENDPOINTS  
═══════════════════════════════

1. GET \- Get Available Slots  
2. URL: /Appointment/GetAvailableSlots  
3. Permissions: case.read  
4. Parameters (Header):  
5. \- email (String, Required): Email of the agent  
6. \- date (Date, Required): Format mm/dd/yyyy  
7. \- timezone (String, Optional): PST, EST, CST, etc.  
8. \- timeSlot (String, Optional): 30/60/90 minutes. Default: 30  
9. Response 200: Array of available time slots  
10. Response 401: Unauthorized  
11. Response 403: Access deniedFindCase  
12. Response 500: Internal Server Error

2\. POST \- Book Appointment  
URL: /Appointment/BookAppointment  
Permissions: case.write  
Parameters (Body):

- AgentEmail (String, Required): Email of agent to book with  
- \- Date (DateTime, Required): Format MM/dd/yyyy HH:mm AM/PM  
- \- CaseID (String, Required): Case ID for the appointment  
- \- Comments (String, Optional): Description of appointment  
- \- TimeZone (String, Optional): PST, EST, CST, etc.  
- \- TimeSlot (String, Optional): 30/60/90 minutes  
- \- Subject (String, Optional): Appointment subject  
- \- EventTypeID (Integer, Optional): Corresponds to TaskCategory ID  
- Response 200: Appointment confirmation message  
- Response 401: Unauthorized  
- Response 403: Access denied  
- Response 500: Internal Server Error

3\. GET \- Get Settlement Officer Email  
URL: /Appointment/GetSettlementOfficerEmail  
Permissions: case.read  
Parameters (Header):

- CaseID (String, Required): Case ID  
- Response 200: Settlement officer email address  
- Response 401: Unauthorized  
- Response 403: Access denied  
- Response 500: Internal Server Error

═══════════════════════════════  
BILLING ENDPOINTS  
═══════════════════════════════

1. GET \- Get Case Account  
2. URL: /Billing/CaseAccount  
3. Permissions: payment.read  
4. Parameters (Header):  
5. \- CaseID (Integer, Required): Case ID  
6. Response 200: Case account records  
7. Response 401/403/500: Standard errors

2\. POST \- Create Case Account  
URL: /Billing/CaseAccount  
Permissions: payment.write  
Parameters (Body):

- CaseID (Integer, Required): Case ID  
- \- AccountType (Integer, Required): Type of account  
- \- PrimaryAccount (Boolean, Optional): Is primary account  
- \- BankName (String, Optional): Bank name  
- \- RoutingNo (String, Optional): Bank routing number  
- \- AccountNo (String, Optional): Bank account number  
- \- CCType (Integer, Optional): Credit card type  
- \- CCNM (String, Optional): Credit card number (xxxxxxxxxxxxxxxx)  
- \- CCExpDate (Date, Optional): Format MMYYYY  
- \- CCSecurityNo (String, Optional): CVV  
- Response 200: Created CaseAccountID (store for future reference)  
- Response 401/403/500: Standard errors

3\. GET \- Get Case Payment  
URL: /Billing/CasePayment  
Permissions: payments.read  
Parameters (Header):

- CaseID (Integer, Required): Case ID  
- Response 200: Case payment records  
- Response 401/403/500: Standard errors

4\. POST \- Create Case Payment  
URL: /Billing/CasePayment  
Permissions: payments.write  
Parameters (Body):

- CaseID (Integer, Required): Case ID  
- \- PaymentTypeID (Integer, Optional): Type of payment  
- Response 200: Created CasePaymentID  
- Response 401/403/500: Standard errors

5\. GET \- Get Case Invoice  
URL: /Billing/CaseInvoice  
Permissions: payment.read  
Parameters (Header):

- CaseID (Integer, Required): Case ID  
- Response 200: Case invoice records  
- Response 401/403/500: Standard errors

6\. POST \- Create Case Invoice  
URL: /Billing/CaseInvoice  
Permissions: payment.write  
Parameters (Body):

- CaseID (Integer, Required): Case ID  
- \- InvoiceAmount (Decimal, Optional): Invoice amount  
- Response 200: Created invoice  
- Response 401/403/500: Standard errors

7\. GET \- Get Case Amortization  
URL: /Billing/CaseAmortization  
Permissions: payment.read  
Parameters (Header):

- CaseID (Integer, Required): Case ID  
- Response 200: Case amortization records  
- Response 401/403/500: Standard errors  
8. POST \- Create Case Amortization  
9. URL: /Billing/CaseAmortization  
10. Permissions: payment.write  
11. Parameters (Body):  
12. \- CaseID (Integer, Required): Case ID  
13. Response 200: Created amortization record  
14. Response 401/403/500: Standard errors

9\. GET \- Get Case Billing Summary  
URL: /Billing/CaseBillingSummary  
Permissions: payment.read  
Parameters (Header):

- CaseID (Integer, Required): Case ID  
- Response 200: Case billing summary  
- Response 401/403/500: Standard errors

═══════════════════════════════  
CASE ENDPOINTS  
═══════════════════════════════

1. GET \- Get Case  
2. URL: /Case/Case  
3. Permissions: case.read  
4. Parameters (Header):  
5. \- CaseID (Integer, Required): Case ID  
6. Response 200: Full case details  
7. Response 401/403/500: Standard errors

2\. POST \- Create Case  
URL: /Case/Case  
Permissions: case.write  
Parameters (Body):

- TaxpayerFName (String, Optional): First name  
- \- TaxpayerLName (String, Optional): Last name  
- \- TaxpayerEmail (String, Optional): Email  
- \- TaxpayerPhone (String, Optional): Phone number  
- Response 200: Created CaseID  
- Response 401/403/500: Standard errors

3\. POST \- Update Case  
URL: /Case/Case  
Permissions: case.write  
Parameters (Body):

- CaseID (Integer, Required): Case ID to update  
- \- TaxpayerFName (String, Optional): Updated first name  
- \- TaxpayerLName (String, Optional): Updated last name  
- \- TaxpayerEmail (String, Optional): Updated email  
- \- TaxpayerPhone (String, Optional): Updated phone  
- Response 200: Updated case details  
- Response 401/403/500: Standard errors

4\. GET \- Get Cases By Status  
URL: /Case/CasesByStatus  
Permissions: case.read  
Parameters (Header):

- Status (String, Required): Status to filter by  
- Response 200: Cases matching status  
- Response 401/403/500: Standard errors

5\. POST \- Stop SMS Permission  
URL: /Case/StopSMSPermission  
Permissions: case.write  
Parameters (Body):

- CaseID (Integer, Required): Case ID  
- \- StopSMS (Boolean, Required): True to stop SMS  
- Response 200: SMS permission updated  
- Response 401/403/500: Standard errors

6\. GET \- Get Case Status Information  
URL: /Case/CaseStatusInfo  
Permissions: case.read  
Parameters (Header):

- CaseID (Integer, Required): Case ID  
- Response 200: Case status info  
- Response 401/403/500: Standard errors

═══════════════════════════════  
CASE ACTIVITY ENDPOINTS  
═══════════════════════════════

1. GET \- Get Activities  
2. URL: /CaseActivity/Activity  
3. Permissions: case.read  
4. Parameters (Header):  
5. \- CaseID (Integer, Required): Case ID  
6. Response 200: All activities for the case  
7. Response 401/403/500: Standard errors

2\. POST \- Create Activity  
URL: /CaseActivity/Activity  
Permissions: activity.write  
Parameters (Body):

- CaseID (Integer, Required): Case ID  
- \- Subject (String, Optional): Activity subject  
- \- Comment (String, Optional): Activity comment  
- \- Popup (Boolean, Optional): Show as popup  
- \- Pin (Boolean, Optional): Pin activity  
- Response 200: Created CaseActivity record  
- Response 401/403/500: Standard errors

3\. POST \- Update Activity  
URL: /CaseActivity/Activity  
Permissions: activity.write  
Parameters (Body):

- ActivityID (Integer, Required): Activity ID  
- \- CaseID (Integer, Required): Case ID  
- \- Comment (String, Optional): Updated comment  
- \- Popup (Boolean, Optional): Updated popup status  
- \- Pin (Boolean, Optional): Updated pin status  
- Response 200: Updated CaseActivity record  
- Response 401/403/500: Standard errors

═══════════════════════════════  
DOCUMENTS ENDPOINT  
═══════════════════════════════

1. POST \- Create Case Document  
2. URL: /Documents/CaseDocument  
3. Permissions: case.write  
4. Parameters (Header):  
5. \- CaseID (Integer, Required): Case ID  
6. \- Comment (String, Optional): Document comment  
7. Response 200: Created case document  
8. Response 401/403/500: Standard errors

═══════════════════════════════  
FAX ENDPOINT  
═══════════════════════════════

1. POST \- Send Fax  
2. URL: /Fax/SendFax  
3. Permissions: fax.write  
4. Parameters (Body):  
5. \- CaseID (Integer, Required): Case ID  
6. \- FaxNumber (String, Required): Recipient fax number  
7. \- DocumentPath (String, Optional): Document path  
8. \- Subject (String, Optional): Fax subject  
9. Response 200: Fax sent successfully  
10. Response 401/403/500: Standard errors

═══════════════════════════════  
FIND ENDPOINTS  
═══════════════════════════════

1. GET \- Find Case By Phone  
2. URL: /Find/FindCaseByPhone  
3. Permissions: case.read  
4. Parameters (Header):  
5. \- Phone (String, Required): Phone number  
6. Response 200: Matching cases  
7. Response 401/403/500: Standard errors

2\. GET \- Find Case By Last Name and Phone  
URL: /Find/FindCaseByLastNameAndPhone  
Permissions: case.read  
Parameters (Header):

- LastName (String, Required): Last name  
- \- Phone (String, Required): Phone number  
- Response 200: Matching cases  
- Response 401/403/500: Standard errors

3\. GET \- Find Case By Email  
URL: /Find/FindCaseByEmail  
Permissions: case.read  
Parameters (Header):

- Email (String, Required): Email address  
- Response 200: Matching cases  
- Response 401/403/500: Standard errors

═══════════════════════════════  
REPORT ENDPOINT  
═══════════════════════════════

1. POST \- Get Activity Report  
2. URL: /Report/ActivityReport  
3. Permissions: report.read  
4. Parameters (Body):  
5. \- StartDate (Date, Optional): Report start date  
6. \- EndDate (Date, Optional): Report end date  
7. \- CaseID (Integer, Optional): Filter by case  
8. Response 200: Activity report data  
9. Response 401/403/500: Standard errors

═══════════════════════════════  
SERVICES ENDPOINT  
═══════════════════════════════

1. GET \- Get Service Details  
2. URL: /Services/ServiceDetails  
3. Permissions: service.read  
4. Parameters (Header):  
5. \- ServiceID (Integer, Optional): Service ID  
6. Response 200: Service details  
7. Response 401/403/500: Standard errors

═══════════════════════════════  
TASK ENDPOINTS  
═══════════════════════════════

1. GET \- Get Task or Event  
2. URL: /Task/TaskOrEvent  
3. Permissions: task.read  
4. Parameters (Header):  
5. \- TaskID (Integer, Required): Task ID  
6. Response 200: Task or event details  
7. Response 401/403/500: Standard errors

2\. POST \- Create Task or Event  
URL: /Task/TaskOrEvent  
Permissions: task.write  
Parameters (Body):

- CaseID (Integer, Required): Case ID  
- \- Subject (String, Required): Task subject  
- \- Description (String, Optional): Task description  
- \- DueDate (Date, Optional): Due date  
- \- AssignedTo (String, Optional): Assigned user  
- Response 200: Created task or event  
- Response 401/403/500: Standard errors

═══════════════════════════════  
USER ENDPOINT  
═══════════════════════════════

1. POST \- Disable User  
2. URL: /User/DisableUser  
3. Permissions: user.write  
4. Parameters (Body):  
5. \- UserID (Integer, Required): User ID to disable  
6. \- DisableReason (String, Optional): Reason for disabling  
7. Response 200: User disabled successfully  
8. Response 401/403/500: Standard errors

═══════════════════════════════  
STANDARD ERROR CODES  
═══════════════════════════════  
200 \- Success  
401 \- Unauthorized: Missing or invalid Authorization header  
403 \- Access Denied: Missing required API key permission/scope  
500 \- Internal Server Error: Contact support if persists