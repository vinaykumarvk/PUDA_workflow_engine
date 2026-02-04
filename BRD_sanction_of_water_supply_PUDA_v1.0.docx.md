**Business Requirement Document (BRD)**

**Service: Sanction of Water Supply**

**Project: PUDA Citizen Services Portal & Mobile App**  
Version: 1.0 (Draft)  
Date: 02-Feb-2026

# **1\. Document Control & Approvals**

Document Title: BRD \- Sanction of Water Supply

Owning Department: Engineering / Public Health (PH) Branch (Assumption \- confirm with PUDA)

Primary Source of Truth: PUDA portal 'Sanction of Water Supply' service details (https://www.puda.gov.in/service-details/1475)

Application Disposal Time (SLS): 7 Days

## **1.1 Version History**

| Version | Date | Prepared By | Change Summary | Status |
| :---- | :---- | :---- | :---- | :---- |
| 1.0 | 02-Feb-2026 | Business Analyst | Initial draft for stakeholder review | Draft |

## **1.2 Review & Approval**

| Name | Role | Department/Organisation | Review Comments | Approval (Yes/No) |
| :---- | :---- | :---- | :---- | :---- |
| TBD | Business Owner | PUDA / Authority | TBD | TBD |
| TBD | Process Owner / Department Head | Concerned Branch | TBD | TBD |
| TBD | IT/Tech Lead | Implementation Partner | TBD | TBD |

# **2\. Executive Summary**

The 'Sanction of Water Supply' service enables an applicant to submit an online request via the PUDA Citizen Services Portal/Mobile App. The system shall capture application details and required documents, route the request through role-based scrutiny/verification stages, enforce Service Level Standards (SLS), and on disposal generate a downloadable output (letter/certificate/order) along with notifications and audit trails.

Key service notes from input:

* Physical verification required (as indicated on the service details page).

# **3\. Service Overview**

## **3.1 Service Metadata**

| Attribute | Value |
| :---- | :---- |
| Service Name | Sanction of Water Supply |
| Service Category | Water & Sewerage Services |
| Authorities | PUDA, GMADA, GLADA, BDA (as displayed on portal header) |
| Application Disposal Time (SLS) | 7 Days |
| Workflow Roles | Clerk (1 day) \-\> Junior Engineer (2 days) \-\> SDE (1 day) \-\> Disposal |
| Document(s) Required | Photocopy of Building plan; Attested copy of GPA (if applicable); Certificate from a plumber registered with the Authority; ... |
| Physical Verification | Required. Details to be confirmed. |
| Output | Water Supply Sanction Letter / Approval for connection (downloadable). |
| Channel | Online via citizen portal; assisted channel (Sewa Kendra) \- To be confirmed. |

## **3.2 Trigger & Preconditions**

Trigger:

* Request for sanction/approval of permanent water supply connection for a property under the selected authority.

Preconditions (to be validated):

* Property exists in authority records and is identifiable via UPN/Plot/Scheme.  
* Building plan has been sanctioned and applicant has supporting documents.  
* Applicant has required technical certificates (plumber certificate, architect estimate) as per checklist.

## **3.3 Postconditions**

* On approval, the system issues a downloadable certificate/letter and closes the application.  
* On rejection, the system issues a rejection order with reason/remarks and closes the application.  
* All actions, documents and decisions are retained in audit logs as per retention policy (to be confirmed).

# **4\. Stakeholders and Roles**

## **4.1 External Users**

* Citizen/Applicant (individual)

## **4.2 Internal Users (Role-based)**

* Clerk  
* Junior Engineer  
* SDE

# **5\. Scope**

## **5.1 In Scope**

* Online application submission with draft/save/resume.  
* Document upload and checklist enforcement.  
* Role-based workflow processing with approve/reject/query actions.  
* SLS/SLA tracking and notifications.  
* Generation and download of output certificate/letter.

## **5.2 Out of Scope (for this BRD)**

* Changes to underlying legal/policy rules not present in the input.  
* Field operations beyond what is required for physical verification (detailed checklist formats to be confirmed).  
* Back-office financial accounting outside application-level fee capture and verification.

# **6\. Definitions & Acronyms**

* ARN: Application Reference Number  
* SLS/SLA: Service Level Standard / Service Level Agreement  
* UPN: Unique Property Number  
* PH: Public Health (Engineering)  
* SDE: Sub Divisional Engineer  
* SDO: Sub Divisional Officer  
* CoA: Council of Architecture  
* PAN: Permanent Account Number  
* GST: Goods and Services Tax  
* DD: Demand Draft  
* BG: Bank Guarantee

# **7\. Current Process (As-Is)**

The current (as-is) process is assumed to be largely manual/offline, where applicants submit forms and documents at the authority office and follow up for status. Internal staff process the request through departmental scrutiny and verification and issue a physical letter/certificate. (Assumption \- confirm with PUDA.)

# **8\. To-Be Process Overview (Digital)**

The to-be process digitises service delivery through an online portal and mobile app, enabling guided application capture, e-document submission, workflow-based processing, transparent status tracking, notifications, and digital issuance of outputs.

# **9\. Workflow Details**

## **9.1 Workflow Step Table**

| Step No | Actor | Inputs | Action | Output/Decision | Next State | SLS | Exceptions / Notes |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Applicant | Application form fields; required documents; payment/instrument details (if applicable) | Fill application form, upload documents and submit application | Application submitted; ARN generated | Submitted | Immediate | Eligibility and fee/payment rules to be confirmed where not specified. |
| 2 | System | Submitted application | Validate mandatory fields and required documents; create workflow task for first processing role; send acknowledgement | Task assigned; acknowledgement to applicant | Pending at Clerk | Immediate | Auto-validation rules (e.g., UPN/registry lookup) to be confirmed. |
| 3 | Clerk | Application \+ uploaded documents | Initial scrutiny; verify completeness and basic correctness; record remarks; forward OR raise query OR reject (query/reject assumed) | Forwarded / Query raised / Rejected | Pending at Junior Engineer OR Query Pending OR Rejected | 1 Day | Physical verification requirement and responsibility to be confirmed (if applicable). |
| 4 | Applicant | Query from processing role (if raised) | Provide clarifications/corrections; re-upload document(s) if required; resubmit | Resubmitted application | Resubmitted to Clerk | TBD | Response time window and SLA pause/reset rules to be confirmed. |
| 5 | Junior Engineer | Application package \+ previous stage remarks/verification records | Verification and review; record remarks; forward OR raise query OR reject (assumed) | Forwarded / Query raised / Rejected | Pending at SDE | 2 Days | If physical verification is required, completion may be mandatory prior to approval (Assumption). |
| 6 | SDE | Application package \+ previous stage remarks/verification records | Final review; confirm verification; approve or reject; record final remarks | Approved / Rejected | Approved OR Rejected | 1 Day | If physical verification is required, completion may be mandatory prior to approval (Assumption). |
| 7 | System | Final decision and approval remarks | Generate certificate/letter (approval or rejection order), close application, and notify applicant | Output generated; application closed | Closed | Same day | Digital signature/QR code on output \- recommendation; to be confirmed. |
| 8 | Applicant | Disposed application | Download output and view final status | Download/print as needed | Closed | NA | If physical submission of originals is required, it must be communicated (Open Question). |

## **9.2 State Model**

| State | Description | Entry Trigger | Exit Trigger | Allowed Transitions |
| :---- | :---- | :---- | :---- | :---- |
| Draft | Application is being filled by applicant and not yet submitted. | Citizen saves draft | Citizen submits application | Draft \-\> Submitted |
| Submitted | Application successfully submitted; ARN generated. | Submit action completes | System assigns first task | Submitted \-\> Pending at Clerk |
| Pending at Clerk | Application is under initial scrutiny. | System assignment to role | Role forwards / raises query / rejects | \-\> Pending at Junior Engineer OR \-\> Query Pending OR \-\> Rejected |
| Query Pending | Query raised to applicant for corrections/clarifications. | Officer raises query | Applicant resubmits | Query Pending \-\> Resubmitted |
| Resubmitted | Applicant has responded to query and resubmitted. | Applicant resubmits | System reassigns to originating officer | Resubmitted \-\> Pending at Clerk |
| Pending at Junior Engineer | Application under secondary/technical verification. | Forward from previous role | Role forwards / raises query / rejects / approves | \-\> Approved/Rejected OR \-\> Query Pending OR \-\> Pending at next role |
| Approved | Application is approved by competent authority. | Final approval action | System generates output and closes | Approved \-\> Closed |
| Rejected | Application is rejected with reason/remarks. | Rejection action | System generates rejection order and closes | Rejected \-\> Closed |
| Closed | Processing completed; output issued and available for download. | System closes after decision | NA | Terminal |
| Cancelled/Withdrawn (Assumption) | Applicant withdraws application before decision (if allowed). | Citizen withdraws | System closes | Draft/Submitted/Query Pending \-\> Cancelled/Closed |

# **9A. Data Requirements (DR)**

## **9A.1 Key Entities & Attributes**

* Application (ARN, service, authority, submission date/time, current status, decision details)  
* Applicant (user id, name, contact, KYC identifiers as applicable)  
* Property (UPN/plot/scheme identifiers) \- for property-linked services  
* Document (doc id/type, filename, version, checksum, upload timestamps)  
* Workflow Task (stage, assignee, action, remarks, timestamps, SLA due date)  
* Verification (physical verification flag, verifier, findings, attachments) \- if applicable  
* Payment/Instrument (transaction id OR DD/BG details, amount, verification status) \- if applicable  
* Output (certificate/letter/order number, issue date, signed file, verification QR) \- as applicable  
* Audit Log (event type, actor, timestamp, before/after changes)

## **9A.2 Field List Grouped by Screen/Step**

Fields are derived from the published form on the service details page and grouped for implementation clarity.

| Screen/Step | Field Group | Fields | Ownership & Editability |
| :---- | :---- | :---- | :---- |
| 1 | Property Details | UPN; Area; Authority Name; Plot Number; Property Type; Scheme Name | Citizen-provided. Some fields may be auto-fetched based on UPN (Assumption). Editable in Draft; locked after submit unless query. |
| 2 | Applicant Details | Full Name | Citizen-provided. Editable in Draft; locked after submit unless query. |
| 3 | Building / Construction Details | Date of Sanction of Building Plan; Number of Floors Constructed; Is Basement Constructed; Proposed Covered Area for Basement (sq ft); Proposed Covered Area for Ground Floor (sq ft); Proposed Covered Area for First Floor (sq ft); Proposed Covered Area for Second Floor (sq ft); Is Mumty Constructed; Proposed Covered Area for Mumty (sq ft); Total estimated cost of Construction (as per Architect) | Citizen-provided. Editable in Draft; locked after submit unless query. |
| 4 | Water Connection Technical Details | Purpose of Water Connection; Service Pipe Length (feet); Service Pipe Size; Number of Taps; Size of Tap; Size of Ferrule Cock | Citizen-provided. Editable in Draft; locked after submit unless query. |
| 5 | Documents & Submit | Upload mandatory documents as per Section 10; Applicant declaration/undertaking (if required) \- To be confirmed | Citizen uploads and submits. After submit, only resubmission possible via query. |

## **9A.3 Data Validations & Mandatory Rules**

Mandatory fields and validations shall be applied as follows (items marked as Assumption/TBD require business confirmation):

* Mandatory fields: all published fields as per form must be validated on submit.  
* Format validation: PAN (where present) should match standard PAN format; mobile/email format validation as applicable.  
* Date validation: dates cannot be in the future (e.g., building plan sanction date, installation date) unless explicitly allowed.  
* Conditional fields/documents: GPA upload required only when applicable; sewerage letter upload not required if issued online (for regularisation service).  
* Document validation: file type/size restrictions, readable scan, and mandatory attestation where specified (attestation rules to be confirmed).  
* Workflow validation: only authorised roles can act; approval can be configured to require physical verification completion.

## **9A.4 Data Retention & Archival Flags**

Retention requirements are not specified in the input. Recommended approach (to be confirmed with business):

* Operational data (applications, tasks): retain for minimum 7 years after disposal (policy TBD).  
* Audit logs: retain longer than operational data (e.g., 10 years) and keep immutable.  
* Documents and issued outputs: retain as per record retention schedule applicable to the authority; archival storage after a defined period.  
* Personally Identifiable Information (PII): retain only as required for service delivery and compliance; apply masking for non-essential access.

## **9A.5 Data Requirements (DR) \- Requirement List**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| DR-01 | System shall store an Application record with unique ARN, service/authority, timestamps, current status, and decision history. | Must | An ARN is generated on submission; application status/history is retrievable by applicant and authorised staff. |
| DR-02 | System shall capture core application fields as per the published form (UPN, Area, Authority Name, Plot Number, Property Type, Scheme Name). | Must | All published core fields are present on the form and persisted with the application. |
| DR-03 | System shall link the application to the authenticated user profile and store applicant identity/contact details (name, mobile, email) as applicable. | Must | Application is visible in applicant dashboard; contact details are available for notifications. |
| DR-04 | System shall capture and store service-specific details (Building / Construction Details; Water Connection Technical Details) as structured data. | Must | Service-specific fields are stored and visible to processing officers; exports include these fields where relevant. |
| DR-05 | System shall store Document metadata (type, upload time, uploader, version, checksum) and file in secure repository. | Must | Document can be downloaded by authorised users; version history is maintained for re-uploads. |
| DR-06 | System shall store Workflow Task records per stage with assignment, action, remarks, and SLA timers. | Must | Each stage change creates a task record with timestamps and actor; SLA due date is computed and displayed. |
| DR-07 | System shall store Payment/Instrument record where applicable (online transaction id OR offline DD/BG details) and its verification status. | Should | For services with fees, payment/instrument details are captured and verifiable; application can be configured to block processing until verified. |
| DR-08 | System shall retain immutable audit logs for application creation, updates, document actions, and decisions. | Must | Audit log entries exist for each significant event with actor, timestamp, and changed fields. |
| DR-09 | System shall support configurable retention and archival flags for operational, audit and archival data. | Should | Admins can configure retention category for each data type; archival/export processes use these flags. |

# **10\. Document Requirements**

The following documents are required as per the published service details page. File format/size constraints shall be configurable by administrators.

| Doc ID | Document Name | Provided By | Mandatory | Stage | Validation/Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| DOC-01 | Photocopy of Building plan | Citizen/Applicant | Yes | Submission | Attested/self-attested as applicable; validation by processing officer. |
| DOC-02 | Attested copy of GPA (if applicable) | Citizen/Applicant | Yes | Submission | Attested/self-attested as applicable; validation by processing officer. |
| DOC-03 | Certificate from a plumber registered with the Authority | Citizen/Applicant | Yes | Submission | Attested/self-attested as applicable; validation by processing officer. |
| DOC-04 | Estimate for construction work issued by Architect | Citizen/Applicant | Yes | Submission | Attested/self-attested as applicable; validation by processing officer. |
| DOC-05 | Undertaking regarding illegal construction / illegal water connection at site | Citizen/Applicant | Yes | Submission | Attested/self-attested as applicable; validation by processing officer. |
| DOC-06 | Self attested photographs of all owners | Citizen/Applicant | Yes | Submission | Attested/self-attested as applicable; validation by processing officer. |
| DOC-07 | Self attested Photo Id proofs of all owners | Citizen/Applicant | Yes | Submission | Attested/self-attested as applicable; validation by processing officer. |

# **11\. Functional Requirements (FR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| FR-01 | System shall allow users to select the Authority (PUDA/GMADA/GLADA/BDA) and initiate the 'Sanction of Water Supply' service. | Must | User can initiate the service for a selected authority; service landing page shows key requirements and SLS. |
| FR-02 | System shall provide an online application form capturing Applicant Details and other required details as per the published fields. | Must | All published fields are present and can be saved/submitted. |
| FR-03 | System shall support Save Draft and Resume for partially filled applications. | Must | User can save a draft and resume later; draft is visible in dashboard until submitted or expired (policy TBD). |
| FR-04 | System shall allow upload of mandatory and optional documents as listed for the service, and store them securely with metadata and versioning. | Must | Upload succeeds for allowed formats; staff can view/download documents; re-upload creates a new version. |
| FR-05 | System shall enforce mandatory data/document validations before allowing final submission. | Must | Submission is blocked if any mandatory field or mandatory document is missing. |
| FR-06 | On successful submission, system shall generate a unique Application Reference Number (ARN) and provide acknowledgement to the applicant. | Must | ARN is generated and displayed; acknowledgement is sent via configured channels (SMS/email/in-app). |
| FR-07 | System shall provide applicant dashboard features: view status, stage, pending queries, and download issued outputs. | Must | Applicant can track application end-to-end and download final output after disposal. |
| FR-08 | System shall route applications through role-based workflow stages as per service configuration (starting with 'Clerk'). | Must | After submission, the application appears in the first stage officer inbox; subsequent stage routing matches configured workflow. |
| FR-09 | System shall provide internal users an inbox/worklist with the ability to open an application, view data/documents, add remarks, and take actions (forward/approve/reject/raise query). | Must | Internal user can complete task actions; action and remarks are stored and reflected in status history. |
| FR-10 | System shall support query and rework loop: internal user can raise a query; applicant can respond and resubmit; application returns to the originating stage. | Must | Query raised triggers applicant notification; applicant can edit allowed fields, re-upload docs, and resubmit; workflow resumes correctly. |
| FR-11 | System shall support service-specific verification needs: Physical verification is required as per portal note; completion criteria to be confirmed. | Should | Verification outcome is captured as structured fields/remarks; approval can be configured to require verification completion. |
| FR-12 | System shall support fee/payment capture for the service where applicable. Fee/connection charges are not specified on the service details page; to be confirmed (may be payable online or via demand note). | Should | If fee is configured: payment is captured (online transaction or offline instrument details) and receipt/reference is stored; failures are handled gracefully. |
| FR-13 | System shall compute and display stage-wise due dates based on configured SLS and track SLA breaches. | Should | Each task shows a due date; overdue tasks are flagged; SLA breach is reportable. |
| FR-14 | On disposal (approval/rejection), system shall generate a downloadable output (certificate/letter/order) with unique number and digital signature/QR code (recommendation). | Must | Applicant and authorised staff can download the final output; output is tamper-evident (e.g., signed/QR). |
| FR-15 | System shall send notifications to applicant and internal users for key events (submission, query, resubmission, approval, rejection, SLA breach). | Must | Notifications are triggered at configured events; failure retries and status logs are available. |
| FR-16 | System shall provide internal search and retrieval by ARN, applicant name, UPN/plot (where applicable), and status. | Must | Authorised staff can search and open applications within permitted scope. |
| FR-17 | System shall provide administrative configuration for service parameters (document checklist, workflow stages/roles, SLS, fees) without code changes. | Should | Admin users can update configuration and changes apply to new applications; audit log of configuration changes exists. |
| FR-18 | System shall support download/export of application data for operational and MIS purposes (role-restricted). | Could | Authorised users can export filtered application lists with key fields; sensitive fields are masked based on role. |

# **12\. Non-Functional Requirements (NFR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| NFR-01 | System shall be available for citizens and staff as per agreed uptime (e.g., \>=99.5% monthly) excluding planned maintenance. | Should | Uptime reports are available; planned downtime is communicated. |
| NFR-02 | Key user actions (login, service search, form load, submit) shall meet performance targets under peak load. | Should | 95th percentile page response times meet agreed thresholds in performance testing. |
| NFR-03 | System shall support horizontal scalability to handle seasonal spikes in application volume. | Should | System scales without functional degradation; performance test evidence available. |
| NFR-04 | System shall enforce role-based access control (RBAC) for all internal and citizen functions. | Must | Users can only view/act on applications per role and jurisdiction configuration. |
| NFR-05 | All sensitive data (PII, documents) shall be encrypted in transit and at rest. | Must | TLS for transport; storage encryption enabled; keys managed securely. |
| NFR-06 | System shall maintain accessibility and mobile responsiveness for citizen-facing screens. | Should | Meets agreed accessibility baseline (e.g., WCAG 2.1 AA \- recommendation) and works on common mobile devices. |
| NFR-07 | System shall log security events and support monitoring/alerting for suspicious activities. | Should | Security logs available; alerts configured for repeated failures/unauthorised access attempts. |
| NFR-08 | System shall support backup, restore, and disaster recovery processes meeting agreed RPO/RTO. | Should | DR drills demonstrate recovery within agreed RPO/RTO. |
| NFR-09 | System shall ensure data integrity for uploaded documents using checksums and version control. | Must | Checksum stored and verified on download; version history visible to authorised users. |
| NFR-10 | System shall support configuration-driven localisation (English/Punjabi) and consistent date/number formats. | Could | UI labels and messages can be toggled by language; formats are consistent across channels. |

# **12A. Audit & Compliance Requirements**

## **12A.1 Audit Trail Events**

* Citizen login/logout; assisted channel marker (if applicable).  
* Application created, saved, edited, submitted, withdrawn/cancelled (if supported).  
* Document upload, replacement/version update, download/view by internal users.  
* Workflow assignment changes, forward actions, query issuance, resubmission events.  
* Decision events: approve/reject, with remarks and reason codes.  
* Payment/instrument events: initiated, success/failure, verification accepted/rejected (if applicable).

## **12A.2 Document Integrity & Versioning**

* Each uploaded file shall be stored with checksum/hash to detect tampering.  
* If a document is re-uploaded during query cycle, system shall create a new version and retain older versions.  
* Generated outputs shall be stored as immutable files once issued.

## **12A.3 Access Logging & Role-based Viewing**

* All document views/downloads by internal users shall be logged with user id, timestamp and ARN.  
* RBAC shall restrict access to applications and documents based on role and jurisdiction/authority mapping.  
* Sensitive fields (Aadhaar/PAN) should be masked for roles that do not require full visibility (recommendation).

## **12A.4 Retention & Archival**

* Retention schedule to be confirmed with business; system shall support configurable retention categories (operational/audit/archival).  
* Archival exports should maintain referential integrity between application, documents, tasks and audit logs.

# **13\. Business Rules (BR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| BR-01 | Authority selection shall be mandatory for service initiation and submission. | Must | System does not allow submission without selecting an authority. |
| BR-02 | Building plan copy shall be mandatory for Water Supply Sanction applications. | Must | Submission is blocked if Building Plan document is missing. |
| BR-03 | If GPA is applicable, attested copy of GPA shall be uploaded; otherwise it may be omitted. | Must | System provides conditional document requirement based on user selection (GPA applicable Yes/No). |
| BR-04 | Plumber certificate and architect estimate shall be mandatory documents as per service checklist. | Must | Submission is blocked if mandatory technical certificates are missing. |
| BR-05 | If physical verification is marked as required for the service, final approval shall be blocked until verification is completed (Assumption \- confirm with business). | Should | Approver cannot approve when verification status is 'Pending' if rule is enabled. |
| BR-06 | Query loop shall be supported. Applicant can only edit fields/documents explicitly unlocked by the query-raising officer. | Should | System restricts editable fields post-submission; query marks specific fields/docs as editable. |
| BR-07 | SLS/SLA shall be calculated based on working days as per authority policy (working calendar to be confirmed). | Should | Due dates follow configured calendar and pause rules during applicant response window (if configured). |
| BR-08 | Rejection shall require selection of a rejection reason code and free-text remarks (reason codes to be confirmed). | Must | System does not allow rejection without reason; reason is visible to applicant. |
| BR-09 | Document file formats (PDF/JPEG/PNG) and size limits shall be configurable by administrators. | Must | Admin can configure allowed formats/sizes; system enforces at upload. |
| BR-10 | Duplicate submissions (same applicant \+ key identifiers within a configurable window) shall be detected and handled. | Could | System alerts applicant/staff and prevents duplicates if rule enabled. |
| BR-11 | Any offline instrument (DD/BG) details captured shall be verifiable and editable only in Draft/Query states; internal verification status is editable only by authorised staff. | Should | Citizen cannot alter instrument details after submission unless query; staff can mark Verified/Rejected with remarks. |

# **14\. Integrations (IR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| IR-01 | System shall integrate with SMS gateway for sending transactional notifications. | Must | SMS is delivered for submission, query, and disposal events; failures are logged and retried. |
| IR-02 | System shall integrate with Email service for sending notifications (where email is available). | Should | Email templates are configurable; delivery status is logged. |
| IR-03 | System shall integrate with a Document Management/Storage service for secure storage of uploaded documents and generated outputs. | Must | Documents are stored with metadata and access control; retrieval works for authorised users. |
| IR-04 | System shall integrate with a payment gateway for online fee collection where applicable. | Should | Online payment success/failure callbacks update application status and generate receipt. |
| IR-05 | System should support validation of plumber registration/licence against an authority-maintained registry (if available). | Could | If registry is available, licence number can be validated; otherwise manual verification is recorded. |
| IR-06 | System should integrate with Authority Property Master/UPN database to fetch property details and validate identifiers. | Should | UPN lookup returns property record where available; mismatches are flagged. |
| IR-07 | System should integrate with e-Sign/Digital Signature service for signing issued certificates/letters (recommendation). | Should | Issued outputs are digitally signed or stamped as per authority policy; signature status is verifiable. |
| IR-08 | System should integrate with a central grievance/helpdesk system (if available) to raise/track support tickets for service applications. | Could | Applicant can raise a ticket with ARN reference; staff can view ticket status. |

# **15\. Notifications & Communication**

## **15.1 Notification Events**

| Event | Recipient | Channel | Content (Summary) |
| :---- | :---- | :---- | :---- |
| Application Submitted | Applicant | SMS/Email/In-app | Acknowledgement with ARN for Sanction of Water Supply. |
| Query Raised | Applicant | SMS/Email/In-app | Query details and resubmission instructions; due date for response (if applicable). |
| Resubmission Received | Processing Officer | In-app/Email | Notification that applicant has responded; task returned to officer inbox. |
| Application Approved | Applicant | SMS/Email/In-app | Approval confirmation and link to download certificate/letter. |
| Application Rejected | Applicant | SMS/Email/In-app | Rejection reason code and remarks; next steps (appeal/resubmission) \- policy TBD. |
| SLA Breach / Overdue | Internal Supervisor | In-app/Email | Escalation alert for overdue task; includes ARN, stage, officer, days overdue. |
| Payment/Instrument Failure (if applicable) | Applicant | SMS/Email/In-app | Payment failed or instrument verification failed; instructions to retry/correct. |

## **15.2 Sample Notification Templates (Indicative)**

SMS \- Application Submitted (Template)

PUDA: Your 'Sanction of Water Supply' application has been submitted. ARN: {ARN}. Track status on portal.

SMS \- Query Raised (Template)

PUDA: Query raised for ARN {ARN} in 'Sanction of Water Supply'. Please respond by {DUE\_DATE} on portal.

SMS \- Application Approved (Template)

PUDA: Your 'Sanction of Water Supply' application ARN {ARN} is approved. Download certificate/letter from portal.

# **16\. Reporting & MIS (REP)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| REP-01 | System shall provide a dashboard showing application counts by status/stage for the service. | Must | Dashboard shows Submitted/Pending/Query/Approved/Rejected counts with filters. |
| REP-02 | System shall provide ageing and SLA breach reports by stage and by officer. | Should | Report lists overdue tasks and days overdue; export available. |
| REP-03 | System shall provide disposal statistics (approved/rejected) by period, authority, and property type (where applicable). | Should | MIS report can be generated for selected date range and authority. |
| REP-04 | System shall provide query/rework report showing reasons, number of rework cycles, and average closure time. | Could | Report identifies top deficiency reasons and rework frequency. |
| REP-05 | Where fees/penalties are applicable, system shall provide payment/instrument reconciliation reports. | Should | Report shows amount due/paid/verified; mismatches are flagged. |
| REP-06 | Where physical verification is applicable, system shall provide verification status and outcomes report. | Should | Report lists pending verifications and outcomes (pass/fail) with officer details. |
| REP-07 | System shall allow export of audit trail for a given ARN for compliance purposes. | Must | Authorised users can export/download audit log entries for an application. |

# **17\. SLAs/SLS, Escalation & Rework Rules**

## **17.1 Published SLS**

As per the service details page, overall application disposal time is 7 days with stage-wise allocation:

* Clerk: 1 day(s)  
* Junior Engineer: 2 day(s)  
* SDE: 1 day(s)

## **17.2 SLA Clock Handling (Recommendations)**

* SLA timer starts when application is successfully submitted (and payment/instrument details are captured successfully, if applicable).  
* SLA timer pauses during applicant query response window (recommended) and resumes upon resubmission (policy to be confirmed).  
* Stage-wise SLA should be tracked per task with due dates and escalation triggers.

## **17.3 Escalation Matrix (To be confirmed)**

The input does not provide escalation roles. Recommended approach (to be validated):

* If first stage exceeds SLA: escalate to immediate supervisor (e.g., Superintendent/Section Head).  
* If verification stage exceeds SLA: escalate to department head (e.g., XEN/EE/SDO as applicable).  
* If overall SLS breached: escalate to service owner and publish breach in MIS.

## **17.4 Rework & Rejection Rules**

Query and rework cycles are not explicitly listed in the input. Recommended rules (to be confirmed):

* Internal user can raise query with reason and specify fields/documents to be corrected.  
* Applicant gets configurable time window to respond (e.g., 7 days) after which application may be auto-rejected/closed (policy TBD).  
* Rejection must include reason code and remarks; applicant receives downloadable rejection order.

# **18\. Test Scenarios**

Test cases below cover happy path, rework, rejection, SLA breach, document mismatch, and payment/instrument failures (where applicable).

| TC ID | Scenario | Preconditions | Steps (High-level) | Expected Result | Type |
| :---- | :---- | :---- | :---- | :---- | :---- |
| TC-WS-01 | Happy path approval without query | Applicant logged in; required data and documents available. | Fill form \-\> upload docs \-\> submit \-\> internal processing \-\> approve \-\> download output | Application is approved within SLS; output is generated and downloadable. | Happy |
| TC-WS-02 | Mandatory field validation | Applicant logged in. | Attempt submission with missing mandatory fields | System blocks submission and highlights missing fields. | Negative |
| TC-WS-03 | Mandatory document missing | Applicant logged in. | Attempt submission without uploading a mandatory document | System blocks submission and shows required document checklist. | Negative |
| TC-WS-04 | Query raised and resubmission | Application submitted successfully. | Officer raises query \-\> applicant receives notification \-\> applicant edits allowed fields/re-uploads docs \-\> resubmits | Application returns to the originating officer; query is marked resolved on further processing. | Rework |
| TC-WS-05 | Rejection by competent authority | Application submitted successfully. | Application processed \-\> approver rejects with reason code and remarks | Status becomes Rejected; rejection order is generated; applicant is notified. | Negative |
| TC-WS-06 | SLA breach at an internal stage | Application pending at a stage beyond due date. | Let task exceed configured due date | Task flagged overdue; escalation notification sent; breach recorded in report. | SLA |
| TC-WS-07 | Document mismatch detected during scrutiny | Application submitted. | Officer marks document mismatch and raises query or rejects | System captures mismatch reason; applicant is notified; workflow follows decision. | Negative |
| TC-WS-08 | Physical verification fail | Physical verification required for service. | Verifier records failed verification \-\> approver rejects (or raises query) | Decision recorded with verification remarks; applicant notified; output generated. | Negative |
| TC-WS-09 | No-fee service does not prompt for payment | Applicant initiates service. | Proceed to submission flow | No payment step is shown by default; submission succeeds based on data/docs. | Functional |
| TC-WS-10 | Duplicate application detection | An existing active application exists for same key identifiers. | Submit a second application with same identifiers | System warns or blocks duplicate submission as per configured rule. | Negative |
| TC-WS-11 | Role-based access control for internal staff | Two staff users with different roles. | Attempt to access applications outside role/jurisdiction | Access denied or masked data; attempt is logged. | Security |
| TC-WS-12 | Output download and verification | Application disposed. | Applicant downloads output; verify QR/digital signature (if enabled) | Output is readable and verifiable; download logged in audit. | Functional |

# **19\. Traceability Matrix, Risks, Dependencies, Assumptions & Open Questions**

## **19.1 Traceability Matrix**

| Workflow Step | Step Name | Mapped Requirements (FR/BR/DR/IR/NFR/REP) | Mapped Test Cases |
| :---- | :---- | :---- | :---- |
| 1 | Fill application form, upload documents and submit application | FR-01, FR-02, FR-03, FR-04, FR-05, DR-01, DR-02, DR-03 | TC-WS-01, TC-WS-02, TC-WS-03 |
| 2 | Validate mandatory fields and required documents | FR-06, FR-08, FR-14, FR-15, DR-01, DR-06, NFR-09 | TC-WS-01, TC-WS-12 |
| 3 | Initial scrutiny | FR-08, FR-09, FR-10, FR-13, BR-06, DR-06, DR-08, FR-11, BR-05 | TC-WS-04, TC-WS-05, TC-WS-06, TC-WS-08 |
| 4 | Provide clarifications/corrections | FR-01, FR-02, FR-03, FR-04, FR-05, DR-01, DR-02, DR-03 | TC-WS-01, TC-WS-02, TC-WS-03 |
| 5 | Verification and review | FR-08, FR-09, FR-10, FR-13, BR-06, DR-06, DR-08, FR-11, BR-05 | TC-WS-04, TC-WS-05, TC-WS-06, TC-WS-08 |
| 6 | Final review | FR-08, FR-09, FR-10, FR-13, BR-06, DR-06, DR-08, FR-11, BR-05 | TC-WS-04, TC-WS-05, TC-WS-06, TC-WS-08 |
| 7 | Generate certificate/letter (approval or rejection order), close application, and notify applicant | FR-06, FR-08, FR-14, FR-15, DR-01, DR-06, NFR-09 | TC-WS-01, TC-WS-12 |
| 8 | Download output and view final status | FR-01, FR-02, FR-03, FR-04, FR-05, DR-01, DR-02, DR-03 | TC-WS-01, TC-WS-02, TC-WS-03 |

## **19.2 Dependencies**

| Dependency | Description | Impact if Not Available |
| :---- | :---- | :---- |
| Property Master Data (UPN/Plot) | Ability to identify property and fetch/validate property identifiers. | Manual verification required; delays; higher risk of mismatches. |
| User Authentication | Citizen login and internal staff login/RBAC. | Cannot securely submit/process applications. |
| Document Storage/DMS | Secure upload and long-term storage of documents and outputs. | Compliance and operational risk; service cannot run reliably. |
| Notification Gateway | SMS/Email for citizen updates and SLA alerts. | Reduced transparency; missed SLA escalations. |
| Payment/Instrument Handling (if applicable) | Payment gateway or offline instrument verification (DD/BG) process. | Applications may not proceed; revenue leakage/compliance risk. |

## **19.3 Risks**

| Risk | Description | Likelihood | Mitigation |
| :---- | :---- | :---- | :---- |
| R-01 | Incorrect property identifiers (UPN/Plot/Scheme) may cause wrong linkage and delays. | Medium | UPN lookup and validation; manual override with audit trail; user guidance. |
| R-02 | Document fraud or tampered uploads. | Medium | Checksum/versioning; access logs; physical verification where applicable; cross-checks with registries if feasible. |
| R-03 | SLA breaches due to staffing constraints and verification delays. | High | Escalations; workload dashboards; configurable SLA pause during applicant query window. |
| R-04 | Integration failures (notifications/payment/DMS) impacting service continuity. | Medium | Retry mechanisms; monitoring; fallback workflows; alerting. |
| R-05 | Privacy risk due to exposure of PII/documents. | Medium | Strict RBAC; access logging; masking; encryption; secure storage. |
| R-06 | Ambiguity in eligibility and fee rules may lead to inconsistent decisions. | High | Business validation workshops; publish clear rules, reason codes, and checklists. |

## **19.4 Assumptions**

* Query/rework loop (raise query, resubmission) is supported though not explicitly detailed for all services in the input.  
* Output includes an approval/rejection letter/certificate downloadable by applicant. Final format and signing method are to be confirmed.  
* Assisted channel (Sewa Kendra) may be supported; exact roles and assisted workflow to be confirmed.  
* Physical verification requirement implies a field verification task; checklist format and capturing of geo-tagged photos are recommendations (confirm).

## **19.5 Open Questions for Business Confirmation**

* Is any processing fee / connection charge applicable for Water Supply Sanction? If yes, amount rules and payment mode (online vs demand note) to be confirmed.  
* Is Occupation Certificate required for water supply sanction for certain property types/floor areas?  
* Does the system need to generate a demand note based on pipe length/size or other parameters?  
* What constitutes 'physical verification' and what checklist/report format is required?  
* What are the standard rejection reason codes to be presented to applicants?  
* What are allowed file formats/size limits for each document type (if different across documents)?  
* Is there any requirement for physical submission of original documents? If yes, how should portal communicate and track it?

## **19.6 References**

* Service details page (input): https://www.puda.gov.in/service-details/1475  
* No external/public policy sources were used to define workflow rules. Any best-practice statements are treated as recommendations and require business confirmation.

