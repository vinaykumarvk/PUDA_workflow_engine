**Business Requirement Document (BRD)**

**Service: Change of Ownership (Sale / Transfer / Gift Deed)**

Project: PUDA Citizen Services Portal & Mobile App  
Version: 1.0 (Draft)  
Date: 02 Feb 2026  
Prepared by: Senior Business Analyst / Government e-Services Domain Expert

# **1\. Document Control & Approvals**

**Document Title:** BRD \- Change of Ownership (Sale/Transfer/Gift Deed)

**Owning Department:** Estate/Property Branch (Assumption \- confirm with PUDA)

**Primary Source of Truth:** PUDA portal 'Change of Ownership' service details (Service ID 25), accessed 02 Feb 2026\.

**Application Disposal Time (SLS):** 5 Days (as published on service details page).

## **1.1 Version History**

| Version | Date | Prepared By | Change Summary | Status |
| :---- | :---- | :---- | :---- | :---- |
| 1.0 | 02 Feb 2026 | Senior Business Analyst | Initial draft based on PUDA service workflow and form fields. | Draft |

## **1.2 Review & Approval**

| Name | Role | Department/Organisation | Review Comments | Approval (Yes/No) |
| :---- | :---- | :---- | :---- | :---- |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

# **2\. Executive Summary**

The 'Change of Ownership' service enables an applicant to request updation of ownership records for a PUDA/Area Development Authority property after execution/registration of a Sale Deed, Transfer Deed, or Gift Deed. The citizen submits an online application with property details, transferee details (as per NOC where applicable), and uploads the certified deed copy. The application is processed through a role-based workflow involving Clerk (2 days), Senior Assistant (2 days) and Superintendent (1 day), with an overall Service Level Standard (SLS) of 5 days. The portal indicates physical verification is required.

# **3\. Service Overview**

## **3.1 Service Metadata**

| Attribute | Value |
| :---- | :---- |
| Service Name | Change of Ownership |
| Service Category | Property/Plot Services |
| Authorities | PUDA, GMADA, GLADA, BDA (as displayed on portal header) |
| Application Disposal Time (SLS) | 5 Days |
| Workflow Roles | Clerk (2 days) \-\> Senior Assistant (2 days) \-\> Superintendent (1 day) \-\> Disposal |
| Document(s) Required | Certified copy of Sale Deed / Transfer Deed / Gift Deed issued by the Sub-Registrar |
| Physical Verification | Required (portal note). Details of verification method and responsible role: To be confirmed. |
| Output | Updated ownership record and disposal decision (Approval/Rejection). Certificate/order format: To be confirmed. |
| Channel | Online via citizen portal; assisted channel (Sewa Kendra) \- To be confirmed. |

## **3.2 Trigger & Preconditions**

**Trigger:** 

Execution/registration of Sale Deed/Transfer Deed/Gift Deed for a PUDA/ADA property and request to update ownership records.

**Preconditions (to be validated):** 

\- Property exists in authority records and is identifiable via UPN/Plot/Scheme.  
\- Applicant has the registered/certified deed copy issued by Sub-Registrar.  
\- If an NOC/Permission for sale/transfer was required earlier, transferee details should match the NOC (assumption based on form label).

## **3.3 Postconditions**

\- On approval, the property ownership master record is updated to reflect the new owner(s).  
\- Application is disposed with a recorded decision and remarks.  
\- Applicant can download the disposal output (approval letter/order) and view updated status (assumption \- confirm output format).

# **4\. Stakeholders and Roles**

## **4.1 External Users**

\- Applicant/Citizen: Typically the transferee/new owner or authorised representative submitting the request (Open Question: who is eligible to apply).

## **4.2 Internal Users (Role-based)**

| Role | Primary Responsibilities | System Access | SLS Allocation |
| :---- | :---- | :---- | :---- |
| Clerk | Initial scrutiny of application and uploaded deed; verify completeness; record remarks; forward/raise query/reject (query/reject assumed). | Internal portal dashboard | 2 Days |
| Senior Assistant | Secondary scrutiny; verify deed and transferee details; ensure compliance; forward/raise query/reject (assumed). | Internal portal dashboard | 2 Days |
| Superintendent | Final review; confirm physical verification completion; approve or reject; dispose the case. | Internal portal dashboard | 1 Day |
| System | Auto-validation, ARN generation, task assignment, SLA tracking, notifications, and record update on approval. | Backend services | Immediate/NA |

# **5\. Scope**

## **5.1 In Scope**

\- Citizen-facing application form for Change of Ownership including property details, applicant details, transferee details, and document upload.  
\- Workflow automation and role-based processing for Clerk, Senior Assistant, and Superintendent.  
\- SLA/SLS tracking as per published timelines; escalation rules as configurable (recommendation).  
\- Document storage and verification status tracking.  
\- Notifications and application status tracking.  
\- Disposal output generation and download (approval/rejection order) and back-office record update (assumption \- confirm).

## **5.2 Out of Scope (for this BRD)**

\- Change of Ownership in death cases (Registered Will/Unregistered Will/All Legal Heirs) which have separate published workflows and document lists.  
\- New policy definition or fee schedules not provided in the input.  
\- Physical field inspection process design beyond capturing that physical verification is required (details to be confirmed).

# **6\. Definitions & Acronyms**

| Term | Definition |
| :---- | :---- |
| PUDA | Punjab Urban Planning & Development Authority |
| GMADA | Greater Mohali Area Development Authority |
| GLADA | Greater Ludhiana Area Development Authority |
| BDA | Bathinda Development Authority |
| UPN | Unique Property Number (as shown in the application form) |
| NOC | No Objection Certificate/Permission (e.g., for sale/transfer), referenced by the form label 'as per NOC' |
| SLS/SLA | Service Level Standard/Agreement \- the maximum allowed time for a step/service |
| ARN | Application Reference Number (system-generated) |

# **7\. Current Process (As-Is)**

The detailed existing (as-is) process is not provided in the input. It is assumed that the legacy process involved physical submission of deed copies and manual scrutiny in the Estate/Property office. This BRD focuses on digitising the published workflow and form. (Assumption \- confirm as-is steps and pain points in workshops.)

# **8\. To-Be Process Overview (Digital)**

The digital process will allow online submission and tracking, automated task routing to internal roles, document management, physical verification capture, and disposal within 5 days. The workflow will support structured decisions (forward/query/approve/reject) and time-bound processing.

# **9\. Workflow Details**

The published processing sequence is: Submit Application \-\> Clerk (2 Days) \-\> Senior Assistant (2 Days) \-\> Superintendent (1 Day) \-\> Disposal, with physical verification required.

## **9.1 Workflow Step Table**

| Step No | Actor | Inputs | Action | Output/Decision | Next State | SLS | Exceptions / Notes |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Applicant | Property details; Applicant name; Transferee details; Deed copy | Fill application form and upload certified deed copy; submit application | Application submitted; ARN generated (system) | Submitted | Immediate | Applicant eligibility and fee (if any) are to be confirmed. |
| 2 | System | Submitted application | Validate mandatory fields and required document presence; create workflow task for Clerk; send acknowledgement | Task assigned to Clerk; acknowledgement to applicant | Pending at Clerk | Immediate | Auto-validation rules to be confirmed (UPN/Plot lookup). |
| 3 | Clerk | Application \+ deed document | Initial scrutiny; verify completeness and basic correctness; record remarks; forward to Senior Assistant OR raise query OR reject (query/reject assumed) | Forwarded / Query raised / Rejected | Pending at Senior Assistant OR Query Pending OR Rejected | 2 Days | Physical verification required (method/role TBD). |
| 4 | Applicant | Query from Clerk (if raised) | Provide clarifications/corrections; re-upload document(s) if required; resubmit | Resubmitted application | Resubmitted to Clerk | TBD | Response time window and SLA pause/reset rules \- Open Question. |
| 5 | Senior Assistant | Application package \+ Clerk remarks | Secondary scrutiny; verify deed details and transferee details (as per NOC where applicable); forward to Superintendent OR raise query OR reject (assumed) | Forwarded / Query raised / Rejected | Pending at Superintendent OR Query Pending OR Rejected | 2 Days | Transferee matching with NOC \- assumption based on form label. |
| 6 | Superintendent | Application \+ verification records | Final review; confirm physical verification completion; approve or reject; record final remarks | Approved / Rejected | Approved OR Rejected | 1 Day | Physical verification completion is mandatory before approval (assumption based on portal note). |
| 7 | System | Final decision | Update ownership master record on approval; generate disposal output (approval/rejection order); close application; notify applicant | Ownership updated; order generated; application closed | Closed | Same day | Integration with property master and document signing \- to be confirmed. |
| 8 | Applicant | Disposed application | Download output and view final status | Download/print as needed | Closed | NA | If physical original submission is required, it must be communicated (Open Question). |

## **9.2 State Model**

| State | Description | Entry Trigger | Exit Trigger | Allowed Transitions |
| :---- | :---- | :---- | :---- | :---- |
| Draft | Application is being filled by applicant; not yet submitted. | Create new application | Submit | Draft \-\> Submitted; Draft \-\> Cancelled |
| Submitted | Application submitted; system validations and assignment pending/complete. | Submit | Auto-assign to Clerk | Submitted \-\> Pending at Clerk; Submitted \-\> Payment Pending (if applicable) |
| Payment Pending | Fee payment is pending or failed (only if fee is configured). | Payment required | Payment success / cancel | Payment Pending \-\> Pending at Clerk; Payment Pending \-\> Cancelled |
| Pending at Clerk | Application under scrutiny by Clerk. | Auto-assign | Forward / Query / Reject | Pending at Clerk \-\> Pending at Senior Assistant; \-\> Query Pending; \-\> Rejected |
| Query Pending | Applicant must respond to a query/deficiency. | Query raised | Resubmit / timeout | Query Pending \-\> Resubmitted to Clerk; \-\> Rejected (timeout \- to be confirmed) |
| Resubmitted to Clerk | Applicant resubmitted after query. | Resubmit | Clerk action | Resubmitted \-\> Pending at Clerk (same stage) |
| Pending at Senior Assistant | Secondary scrutiny by Senior Assistant. | Forward from Clerk | Forward / Query / Reject | Pending at Senior Assistant \-\> Pending at Superintendent; \-\> Query Pending; \-\> Rejected |
| Pending at Superintendent | Final review and decision. | Forward from Senior Assistant | Approve / Reject | Pending at Superintendent \-\> Approved; \-\> Rejected |
| Approved | Application approved; ownership update and output issuance pending/complete. | Approve | System closure | Approved \-\> Closed |
| Rejected / Closed | Application rejected or disposed and closed. | Reject or close | NA | Terminal state |

# **9A. Data Requirements (DR)**

## **9A.1 Key Entities & Attributes**

The system shall maintain the following key entities for the Change of Ownership service:

| Entity | Key Attributes / Notes |
| :---- | :---- |
| Application | ARN, service, authority, submission date/time, current state, SLA timers, final decision, remarks. |
| Applicant | Citizen profile reference; full name (as per form); contact details (from profile) \- to be confirmed. |
| Property | UPN, area, authority name, plot number, property type, scheme name, reserved price, sale type, usage type. |
| Transferee | Name, father name, address, mobile, email; supports multiple transferees as per NOC. |
| Document | Document type, file metadata, checksum, version, verification status, verifier remarks. |
| Workflow Task | Role/stage, assignee, start/end timestamps, action taken, comments, SLA status. |
| Physical Verification Record | Verification required flag, verification outcome, verifier, date, remarks, supporting report document \- to be confirmed. |
| Audit Log | Immutable event log: who did what, when, from which channel/IP, including document and decision events. |

## **9A.2 Field List Grouped by Screen/Step**

Fields are derived from the published form on the Change of Ownership service page.

| Screen/Step | Field Group | Fields | Ownership & Editability |
| :---- | :---- | :---- | :---- |
| 1 | Property Details | UPN; Area; Authority Name; Plot Number; Property Type; Scheme Name; Reserved Price; Sale Type; Usage Type | Citizen enters/selects; some may be auto-fetched (Assumption). Editable in Draft; locked after submit unless query. |
| 2 | Applicant Details | Full Name | Citizen-provided. Editable in Draft; locked after submit unless query. |
| 3 | Transferees Details (as per NOC) | Transferee's Name; Father Name; Address; Mobile; Email (repeatable) | Citizen-provided. Multiple transferees supported. Editable in Draft; locked after submit unless query. |
| 4 | Documents | Upload: Certified copy of Sale Deed/Transfer Deed/Gift Deed issued by Sub-Registrar | Citizen uploads. Versioning required when re-uploading in query cycle. |
| 5 | Declarations & Submit | Applicant confirmation/undertaking (if required) \- To be confirmed | Citizen confirms and submits. After submit, only resubmission possible via query. |

## **9A.3 Data Validations & Mandatory Rules**

Mandatory fields and validations shall be applied as follows (items marked as Assumption require business confirmation):

| Step | Data Element | Validation Rule | Source / Notes |
| :---- | :---- | :---- | :---- |
| Submit | Deed document | Must upload certified copy of Sale/Transfer/Gift deed before submission. | Published required document. |
| Submit | Property identification | At least one unique property identifier must be provided (UPN or Plot+Scheme+Authority). | Assumption \- form shows multiple fields. |
| Submit | Transferee mobile | Must be 10-digit mobile number (India) and numeric. | Assumption \- standard validation. |
| Submit | Transferee email | If provided, must be a valid email format. | Assumption. |
| Internal | Document legibility | Clerk/Senior Assistant must mark document as Verified/Deficient with remarks. | Best-practice control. |
| Internal | NOC consistency | Transferee details must match earlier NOC record where applicable. | Assumption based on form label. |
| Internal | Physical verification | Physical verification outcome must be recorded before Superintendent approval. | Portal note indicates requirement. |

## **9A.4 Data Retention & Archival Flags**

Retention periods are not provided in the input and must be confirmed. The system shall support configurable retention flags:  
\- Operational data: required for active processing and citizen tracking.  
\- Audit data: immutable logs and decision history.  
\- Archival: long-term storage for legal/record purposes.  
Open Question: What is the mandated retention period for change of ownership applications and documents?

## **9A.5 Data Requirements (DR) \- Requirement List**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| DR-01 | System shall store an Application record with unique ARN, service/authority, timestamps, status, and decision history. | Must | An ARN is generated on submission and application status/history is retrievable by citizen and staff. |
| DR-02 | System shall capture Property Details fields shown in the form (UPN, Area, Authority Name, Plot No., Property Type, Scheme Name, Reserved Price, Sale Type, Usage Type). | Must | All property fields are available on the submission form and stored with the application. |
| DR-03 | System shall capture Applicant Full Name as per form and link the application to the authenticated citizen profile. | Must | Applicant name is stored and application is linked to the citizen account. |
| DR-04 | System shall capture one or more Transferee records with Name, Father Name, Address, Mobile, Email. | Must | User can add multiple transferees and data is saved and visible to internal reviewers. |
| DR-05 | System shall store Document metadata (type, upload time, uploader, version, checksum) and file in secure repository. | Must | Document can be downloaded by authorised users; version history is maintained. |
| DR-06 | System shall store Workflow Task records per stage with assignment, action, remarks, and SLA timers. | Must | Each stage change creates a task record with timestamps and actor. |
| DR-07 | System shall store Physical Verification required flag and capture verification outcome/remarks. | Must | Application cannot be approved unless physical verification is marked complete (configurable rule). |
| DR-08 | System shall retain immutable audit logs for application creation, updates, document actions, and decisions. | Must | Audit log entries exist for each significant event with actor and timestamp. |
| DR-09 | System shall support configurable retention and archival flags for operational, audit and archival data. | Should | Admins can configure retention category for each data type; export/archival processes use these flags. |

# **10\. Document Requirements**

The following documents are required as per the published service details:

| Doc ID | Document Name | Provided By | Mandatory | Stage | Validation/Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| DOC-01 | Certified copy of Sale Deed / Transfer Deed / Gift Deed issued by the Sub-Registrar | Citizen | Yes | Submission | Must be readable and complete. Verification is performed during Clerk/Senior Assistant scrutiny. |

Open Question: Does PUDA require physical submission of original/certified documents at the authority office in addition to online upload? If yes, the portal must display clear instructions and capture 'Physical submission received' status.

# **11\. Functional Requirements (FR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| FR-01 | System shall allow citizens to select the Authority (PUDA/GMADA/GLADA/BDA) and initiate the Change of Ownership service. | Must | Citizen can initiate the service for a selected authority. |
| FR-02 | System shall provide an online application form capturing Property Details, Applicant Details, and Transferee Details as per the published fields. | Must | All published fields are present and can be saved/submitted. |
| FR-03 | System shall allow capture of multiple transferees (one-to-many) under 'All Transferees Details as per NOC'. | Must | Citizen can add/edit/remove multiple transferee entries before submission. |
| FR-04 | System shall allow upload of the mandatory deed document and store it securely with metadata and versioning. | Must | Upload succeeds for allowed formats; document is retrievable by authorised users. |
| FR-05 | System shall enforce mandatory data/document validations before allowing final submission. | Must | Submission is blocked if mandatory fields or DOC-01 is missing. |
| FR-06 | System shall generate an Application Reference Number (ARN) and acknowledgement receipt upon successful submission. | Must | ARN and acknowledgement are generated and downloadable/visible to applicant. |
| FR-07 | System shall provide application status tracking to citizens, including current stage and decision history. | Must | Citizen can view status and timeline of actions. |
| FR-08 | System shall provide role-based internal dashboards for Clerk, Senior Assistant, and Superintendent to view and process assigned cases. | Must | Internal users see only applications assigned to their role/queue as per RBAC. |
| FR-09 | Clerk shall be able to record scrutiny remarks and take action: Forward to Senior Assistant, Raise Query to Applicant, or Reject (Query/Reject are assumptions). | Should | Clerk can perform actions and system changes status accordingly; actions are logged. |
| FR-10 | Senior Assistant shall be able to review Clerk-forwarded cases, record remarks, and take action: Forward to Superintendent, Raise Query, or Reject (assumed). | Should | Senior Assistant actions update state and are logged. |
| FR-11 | Superintendent shall be able to approve or reject the application with mandatory remarks and dispose the case. | Must | Superintendent decision sets final status and records reason/remarks. |
| FR-12 | System shall capture physical verification requirement and store verification outcome/remarks before allowing final approval. | Must | Approval cannot be completed unless verification is marked complete (configurable rule). |
| FR-13 | On approval, system shall update the ownership record in the property master and generate an approval order/certificate for applicant download (assumption). | Should | Ownership change is reflected in master system and downloadable output is available. |
| FR-14 | On rejection, system shall generate a rejection order with reason and make it available to the applicant. | Should | Rejection order is downloadable and includes reason code/text. |
| FR-15 | System shall provide configurable SLA timers per stage (Clerk 2 days, Senior Assistant 2 days, Superintendent 1 day) and calculate overall 5-day SLS. | Must | SLA clocks and breach flags are visible in dashboards and reports. |
| FR-16 | System shall send notifications (SMS/email/in-app) on submission, query, resubmission, approval, rejection, and SLA breach (internal). | Should | Notifications are triggered for each configured event and logged. |
| FR-17 | System shall allow authorised staff to search applications by ARN/UPN/Plot/Scheme and export lists to CSV/Excel. | Should | Search results are accurate and exportable. |
| FR-18 | System shall support assisted submission by authorised operators (Sewa Kendra) with an auditable marker of assisted channel (assumption). | Could | Operator can submit on behalf of citizen and audit log captures assisted channel. |

# **12\. Non-Functional Requirements (NFR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| NFR-01 | System shall be available 24x7 for citizen submission and tracking, excluding planned maintenance windows. | Should | Monthly uptime meets agreed target (e.g., 99.5%) \- exact target to be confirmed. |
| NFR-02 | Citizen portal pages shall load within acceptable time under normal load (e.g., \<3 seconds for key screens). | Should | Performance test demonstrates compliance with target response times. |
| NFR-03 | All data in transit shall be encrypted using TLS; sensitive data at rest shall be encrypted. | Must | Security review verifies TLS and encryption at rest controls. |
| NFR-04 | Role-based access control shall ensure internal users can only view/process applications permitted for their role and authority. | Must | RBAC tests confirm no unauthorised access across roles/authorities. |
| NFR-05 | System shall support bilingual UI (English and Punjabi) for citizen-facing screens (recommendation). | Should | Key screens and notifications are available in both languages. |
| NFR-06 | System shall be mobile responsive and support use on common Android/iOS devices (web \+ app). | Should | UI testing confirms responsive layout and no critical usability defects. |
| NFR-07 | System shall protect against common web threats (OWASP Top 10), including file upload security and input sanitisation. | Must | Security testing shows no high/critical vulnerabilities; uploads are scanned/validated. |
| NFR-08 | System shall provide disaster recovery capability with defined RPO/RTO (to be confirmed). | Should | DR drill demonstrates restoration within agreed RTO/RPO. |
| NFR-09 | System shall maintain data integrity and prevent unauthorised modification of submitted applications/documents. | Must | Once submitted, citizen fields are locked except through query-resubmission; document versions are preserved. |
| NFR-10 | System shall log and monitor critical failures (integration, notification, storage) and provide alerts to administrators. | Should | Admin dashboard/logs show failures and retry status; alerts are generated. |

# **12A. Audit & Compliance Requirements**

## **12A.1 Audit Trail Events**

* Citizen login/logout; assisted channel marker (if applicable).  
* Application created, saved, edited, submitted, withdrawn/cancelled.  
* Document upload, replacement/version update, download/view by internal users.  
* Workflow assignment changes, forward actions, query issuance, resubmission events.  
* Decision events: approve/reject, with remarks and reason codes.  
* Physical verification status updates and verifier remarks.  
* System-generated outputs: acknowledgement, approval/rejection order generation, digital signing events (if used).  
* Notifications dispatched (SMS/email/in-app) including failures and retries.  
* Administrative configuration changes (SLA settings, document requirements, role mappings).

## **12A.2 Document Integrity & Versioning**

\- System shall compute and store checksums for uploaded documents to detect tampering.  
\- Documents shall be versioned during query/resubmission; older versions must remain accessible to authorised reviewers.  
\- Downloaded outputs (orders/certificates) shall include unique identifiers (ARN/QR code) and, if digitally signed, signature validity indicators (recommendation).

## **12A.3 Access Logging & Role-based Viewing**

\- All views/downloads of deed documents must be logged (user, role, timestamp, IP/device).  
\- Citizen can view only their own applications.  
\- Internal users can view applications limited by role and authority; cross-authority access requires explicit privilege.

## **12A.4 Retention & Archival**

Retention/archival periods and legal compliance requirements are not provided in the input. The system shall support configurable retention rules for application data, documents, and audit logs. (Open Question: retention period and archival repository requirements.)

# **13\. Business Rules (BR)**

| ID | Rule Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| BR-01 | Overall service disposal time shall be 5 days. | Must | System reports and SLA calculation show total processing within 5 days for non-query cases. |
| BR-02 | Stage-wise SLS shall be: Clerk 2 days, Senior Assistant 2 days, Superintendent 1 day. | Must | SLA timer per stage is configured to these values and breach is flagged. |
| BR-03 | Certified copy of Sale/Transfer/Gift deed issued by Sub-Registrar is mandatory for submission. | Must | System blocks submission without DOC-01. |
| BR-04 | Physical verification is required and must be completed/recorded before final approval. | Must | Superintendent cannot approve unless verification status is 'Completed' (configurable rule). |
| BR-05 | Rejection shall require mandatory reason/remarks captured by the rejecting officer. | Must | Reject action cannot be completed without reason/remarks. |
| BR-06 | Transferee details shall be captured as per NOC where applicable; mismatch handling (query/reject) is to be confirmed. | Should | If NOC data exists, system or reviewer can compare transferee list and flag mismatch. |
| BR-07 | Only the assigned role/stage owner shall be able to process an application at that stage. | Must | RBAC prevents unauthorised actions; audit shows attempted violations blocked. |
| BR-08 | When a query is raised, the application shall move to 'Query Pending' and return to the same stage upon resubmission. | Should | Query/resubmission loop works as designed; stage is preserved. |
| BR-09 | SLA clock treatment during query/resubmission (pause vs reset) shall be configurable. | Should | Configuration exists and reports reflect chosen SLA policy. |
| BR-10 | If fee/payment is applicable (TBD), processing shall start only after successful payment. | Could | Applications with payment pending are not routed to Clerk; they move after payment success. |
| BR-11 | All decisions and actions shall be time-stamped and auditable. | Must | Audit log contains timestamps for each action. |

# **14\. Integrations (IR)**

| ID | Integration Requirement | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| IR-01 | Integration with authentication/identity management for citizen login and internal staff login. | Must | Users can authenticate and sessions are securely managed. |
| IR-02 | Integration with Property Master/UPN database to fetch/validate property details (Assumption \- confirm availability). | Should | Property details can be fetched using UPN/Plot identifiers; mismatches are handled. |
| IR-03 | Integration with NOC/Permission records to validate transferee list 'as per NOC' (Assumption). | Could | System can retrieve NOC record and compare transferee details or provide view to reviewer. |
| IR-04 | Integration with Document Management/Storage service for secure upload, storage, and retrieval. | Must | Documents are stored securely and are retrievable with RBAC. |
| IR-05 | Integration with SMS and Email gateway for notifications. | Must | Notifications are successfully sent and failures are retried/logged. |
| IR-06 | Integration with Payment Gateway if a fee is configured for this service (Open Question). | Could | Payment can be made online; payment status is received and stored. |
| IR-07 | Integration with digital signature/eSign service for issuing digitally signed orders/certificates (Recommendation). | Should | Generated outputs can be digitally signed and validated. |
| IR-08 | Integration with helpdesk/ticketing for citizen support (Recommendation). | Could | Citizen can raise ticket from application screen; ticket ID is linked to application. |

# **15\. Notifications & Communication**

## **15.1 Notification Events**

| Event | Recipient | Channel | Content (Summary) |
| :---- | :---- | :---- | :---- |
| Application Submitted | Applicant | SMS/Email/In-app | Acknowledgement with ARN and expected disposal time (5 days). |
| Query Raised | Applicant | SMS/Email/In-app | Query reason and required action/documents; link to resubmit. |
| Application Resubmitted | Applicant \+ Clerk | In-app/Email | Confirmation of resubmission; returned to Clerk stage. |
| Approved | Applicant | SMS/Email/In-app | Approval confirmation and download link for order/certificate. |
| Rejected | Applicant | SMS/Email/In-app | Rejection reason summary and download link for rejection order. |
| SLA Breach Warning | Internal Supervisor | Email/In-app | Stage SLA breach alert with pending case details. |
| Physical Verification Required/Updated | Applicant (optional) / Internal | In-app | Status update: verification scheduled/completed (if exposed). |

## **15.2 Sample Notification Templates (Indicative)**

SMS \- Application Submitted (Template)

PUDA: Your Change of Ownership application has been submitted. ARN: {ARN}. Expected disposal: 5 days. Track: {PortalLink}.

SMS \- Query Raised (Template)

PUDA: Query raised for ARN {ARN}. Please login and respond with required details/documents to proceed. {PortalLink}.

SMS \- Approved (Template)

PUDA: ARN {ARN} approved. Download order: {PortalLink}.

SMS \- Rejected (Template)

PUDA: ARN {ARN} rejected. Reason: {ShortReason}. Details: {PortalLink}.

# **16\. Reporting & MIS (REP)**

| ID | Report/Metric | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| REP-01 | Pending applications by stage (Clerk/Senior Assistant/Superintendent) with ageing and SLA status. | Must | Report shows accurate counts and highlights breaches. |
| REP-02 | Disposal report: approved/rejected counts, average disposal time, authority-wise break-up. | Must | Report can be filtered by date range and authority. |
| REP-03 | Query report: number of queries, reasons, applicant response time, rework cycles. | Should | Report includes query reason codes and response durations. |
| REP-04 | Physical verification report: cases requiring verification, pending vs completed, outcome summary. | Should | Report reflects verification status and outcomes. |
| REP-05 | Officer performance report: workload, disposal counts, SLA adherence by role/user. | Should | Report available to authorised supervisors; exportable. |
| REP-06 | Audit log export for a given ARN (for legal/compliance requests). | Should | System can export audit trail for an application as PDF/CSV for authorised users. |
| REP-07 | Notification delivery report: sent/failed/retried by channel and event. | Could | Admin can view failure reasons and retry counts. |

# **17\. SLAs/SLS, Escalation & Rework Rules**

## **17.1 Published SLS**

As per the portal, overall application disposal time is 5 days with stage-wise allocation: Clerk 2 days, Senior Assistant 2 days, Superintendent 1 day.

## **17.2 SLA Clock Handling (Recommendations)**

\- SLA timer starts when application is successfully submitted (and payment is successful if fees apply).  
\- If a query is raised, the SLA clock may be paused until citizen resubmits (recommended). This must be confirmed and made configurable.  
\- System shall capture breach timestamps and support escalation notifications to supervisors.

## **17.3 Escalation Matrix (To be confirmed)**

The input does not provide escalation roles. Recommended approach:  
\- If Clerk stage exceeds 2 days: notify Senior Assistant/Superintendent.  
\- If Senior Assistant stage exceeds 2 days: notify Superintendent/Branch Head.  
\- If Superintendent stage exceeds 1 day: notify Branch Head/Competent Authority.  
Open Question: define escalation hierarchy and actions (auto-reassignment vs notification only).

## **17.4 Rework & Rejection Rules**

Query and rework cycles are not explicitly listed in the input. Recommended rules (to be confirmed):  
\- Clerk/Senior Assistant can raise a query for missing/unclear documents or data inconsistencies.  
\- Applicant is given a configurable time window to respond (e.g., 15 days) after which application may be rejected/closed.  
\- Maximum number of query cycles: configurable.  
\- Rejection must include a reason code and free-text remarks.

# **18\. Test Scenarios**

Test cases below cover happy path, rework, rejection, SLA breach, document mismatch, and payment failure (conditional).

| TC ID | Scenario | Preconditions | Steps (High-level) | Expected Result | Type |
| :---- | :---- | :---- | :---- | :---- | :---- |
| TC-01 | Happy path approval within SLA | Valid deed; property identifiable | Submit application \-\> Clerk forwards \-\> Senior Assistant forwards \-\> Superintendent approves \-\> System closes | Status becomes Approved/Closed; output downloadable; notifications sent; within 5 days | Happy |
| TC-02 | Submission blocked due to missing deed | User in Draft | Attempt submit without uploading DOC-01 | System blocks submission and shows mandatory document error | Negative |
| TC-03 | Clerk raises query for illegible document | Application submitted with low-quality scan | Clerk marks document deficient \-\> raises query \-\> applicant re-uploads \-\> resubmits | Application returns to Clerk; document version updated; audit trail maintained | Rework |
| TC-04 | Transferee details mismatch with NOC (if applicable) | NOC exists for property | Senior Assistant compares transferees vs NOC \-\> raises query | Query raised; mismatch details captured; cannot proceed until corrected | Rework |
| TC-05 | Rejection by Superintendent | Application reaches Superintendent | Superintendent rejects with reason | Status becomes Rejected/Closed; rejection order generated; citizen notified | Negative |
| TC-06 | SLA breach at Clerk stage | Application pending at Clerk | No action for \>2 days | System flags SLA breach; escalation notification generated; report updated | SLA |
| TC-07 | Physical verification not completed blocks approval | Verification required flag is true | Superintendent attempts approve without verification marked complete | System prevents approval and prompts to complete verification | Negative |
| TC-08 | Physical verification fails leading to rejection | Verification outcome \= 'Not satisfactory' | Verification recorded \-\> Superintendent rejects | Rejected with remarks referencing verification; audit recorded | Negative |
| TC-09 | Payment failure (only if fee is configured) | Fee configured | User submits \-\> redirected to payment \-\> payment fails | Application remains Payment Pending; user can retry; no routing to Clerk | Payment |
| TC-10 | Notification gateway failure and retry | SMS/Email service unavailable | Trigger approval notification | System logs failure, retries as per policy, and provides admin visibility | Resilience |
| TC-11 | Citizen edits blocked after submission | Application submitted | Citizen attempts to edit property/transferee details | Edits are blocked; user can only edit after query is raised | Security |
| TC-12 | Withdraw application before processing (assumed) | Application in Draft or Submitted | Citizen withdraws | Status becomes Cancelled/Withdrawn; internal tasks not created or cancelled; notifications sent | Alternate |

# **19\. Traceability Matrix, Risks, Dependencies, Assumptions & Open Questions**

## **19.1 Traceability Matrix**

| Workflow Step | Step Name | Mapped Requirements (FR/BR/DR/IR/NFR/REP) | Mapped Test Cases |
| :---- | :---- | :---- | :---- |
| 1 | Citizen submission | FR-02, FR-03, FR-04, FR-05, DR-02, DR-03, DR-04, DR-05, BR-03 | TC-01, TC-02 |
| 2 | System validation & assignment | FR-06, FR-15, IR-01, IR-04, NFR-02, NFR-03 | TC-01 |
| 3 | Clerk scrutiny | FR-08, FR-09, BR-02, BR-08, DR-06, REP-01 | TC-03, TC-06 |
| 4 | Citizen resubmission | FR-07, FR-09, BR-08, BR-09, DR-05, DR-08 | TC-03, TC-11 |
| 5 | Senior Assistant review | FR-10, BR-02, BR-06, IR-03, DR-06 | TC-04 |
| 6 | Superintendent decision | FR-11, FR-12, BR-04, BR-05, NFR-04, DR-07, DR-08 | TC-05, TC-07, TC-08 |
| 7 | System closure & update | FR-13, FR-14, IR-02, IR-07, REP-02, DR-01 | TC-01 |
| 8 | Citizen download | FR-07, NFR-01, NFR-06 | TC-01 |

## **19.2 Dependencies**

| Dependency | Description | Impact if Not Available |
| :---- | :---- | :---- |
| Property Master Data | Ability to identify property and update ownership records. | Manual processing required; delays; risk of incorrect updates. |
| User Authentication | Citizen login and internal staff login/RBAC. | Cannot securely submit/process applications. |
| Document Storage/DMS | Secure upload and long-term storage of deeds and outputs. | Compliance and operational risk; service cannot run. |
| Notification Gateway | SMS/Email for citizen updates and SLA alerts. | Reduced transparency; missed SLA escalations. |
| Payment Gateway (if applicable) | Fee collection and reconciliation. | Applications may not proceed; revenue leakage risk. |

## **19.3 Risks**

| Risk | Description | Likelihood | Mitigation |
| :---- | :---- | :---- | :---- |
| R-01 | Incomplete/incorrect property master data may prevent identification or cause wrong ownership updates. | Medium | Data cleansing; validation rules; manual override with audit. |
| R-02 | Document fraud or tampered deed uploads. | Medium | Checksum/versioning; physical verification; cross-check with registry where feasible. |
| R-03 | SLA breaches due to staffing constraints and physical verification delays. | High | Escalations; workload dashboards; configurable SLA pause during queries. |
| R-04 | Integration failures (property master/notifications/payment). | Medium | Retry mechanisms; monitoring; fallback workflows. |
| R-05 | Privacy risk due to exposure of deed documents/PII. | Medium | Strict RBAC; access logging; masking; secure storage. |
| R-06 | Ambiguity in eligibility and fee rules may lead to inconsistent decisions. | High | Business validation workshops; publish clear rules and reason codes. |

## **19.4 Assumptions**

* Query/rework loop (raise query, resubmission) is supported though not explicitly listed on the service page; treated as recommended workflow control.  
* Output includes an approval/rejection order/certificate downloadable by applicant; exact format and signing requirements to be confirmed.  
* Some property fields (Reserved Price, Sale Type, Usage Type) are auto-fetched from property master after property identification.  
* Citizen is authenticated and profile provides contact details; only full name is explicitly shown in the form.  
* Assisted channel (Sewa Kendra) may be needed; not explicitly stated for this service.

## **19.5 Open Questions for Business Confirmation**

1. Eligibility: Who can apply \- current owner, transferee, both, or authorised GPA/SPA holders?  
2. Fee/Payment: Is there any processing fee for Change of Ownership? If yes, fee head, amount, exemptions, and payment timing.  
3. Property identification: Is UPN mandatory? Which fields are manually entered vs auto-fetched from property master?  
4. Physical verification: What does 'physical verification required' mean (site visit vs in-office original verification)? Who performs it and within what timeline?  
5. Document originals: Is physical submission of original/certified deed required at the authority office? How is receipt acknowledged?  
6. NOC linkage: Is an NOC/Permission prerequisite for this service? If yes, how does the system fetch and validate NOC details?  
7. Rework policy: What is the allowed time window for applicant to respond to a query? How many query cycles are allowed?  
8. SLA policy during query: Should SLA pause, reset, or continue while waiting for applicant response?  
9. Final output: Should the approval order be digitally signed? Should it include QR code for verification?  
10. Retention: What is the record retention period for applications, deed documents, and audit logs?

## **19.6 References**

1\. PUDA portal \- Service Details: 'Change of Ownership' (Service ID 25). Source document captured as PDF from puda.gov.in (accessed 02 Feb 2026).