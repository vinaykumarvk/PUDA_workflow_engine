**Business Requirement Document (BRD)**

**Service: Change of Ownership (Death Case \- Unregistered Will)**

Project: PUDA Citizen Services Portal & Mobile App

Version: 1.0 (Draft)

Date: 03 Feb 2026

Prepared by: Senior Business Analyst / Government e-Services Domain Expert

# **1\. Document Control & Approvals**

**Document Title:** BRD \- Change of Ownership (Death Case \- Unregistered Will)

**Owning Department:** Estate/Property Branch (Assumption \- confirm with PUDA)

**Primary Source of Truth:** PUDA portal service details (https://www.puda.gov.in/service-details/26), accessed 03 Feb 2026\.

**Application Disposal Time (SLS):** 30 Days (as published on service details page).

## **1.1 Version History**

| Version | Date | Prepared By | Change Summary | Status |
| :---- | :---- | :---- | :---- | :---- |
| 1.0 | 03 Feb 2026 | Senior Business Analyst | Initial draft based on PUDA service workflow and form fields. | Draft |

## **1.2 Review & Approval**

| Name | Role | Department/Organisation | Review Comments | Approval (Yes/No) |
| :---- | :---- | :---- | :---- | :---- |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

# **2\. Executive Summary**

The 'Change of Ownership (Death Case \- Unregistered Will)' service enables an applicant to submit an online request via the PUDA citizen portal for ownership updated in puda records; approval/rejection order and updated ownership extract (if applicable). The application is processed through a role-based workflow (Clerk (4 days) \-\> Senior Assistant (5 days) \-\> Estate Officer (6 days) \-\> Disposal). The published Service Level Standard (SLS) is 30 days. The service details page indicates that physical verification is required.

# **3\. Service Overview**

## **3.1 Service Metadata**

| Attribute | Value |
| :---- | :---- |
| Service Name | Change of Ownership (Death Case \- Unregistered Will) |
| Service Category | Citizen Services \- Property/Utility/Permission (TBD by PUDA taxonomy) |
| Authorities | PUDA, GMADA, GLADA, BDA (as displayed on portal header) |
| Application Disposal Time (SLS) | 30 Days |
| Workflow Roles | Clerk (4 days) \-\> Senior Assistant (5 days) \-\> Estate Officer (6 days) \-\> Disposal |
| Document(s) Required | Original Death Certificate of the deceased owner. Original to be submitted at concerned authority; Attested Copy of unregistered will In case, the Will is in a language, other than English, Hindi or Punjabi, a translated copy of the will in English or Punjabi is also be attached.; No objection Affidavits from all left-out legal heirs if the property is bequeathed to one of legal hei or anyone outside family on basis of will; ... |
| Physical Verification | Required (as per portal note) |
| Output | Ownership updated in PUDA records; approval/rejection order and updated ownership extract (if applicable). |
| Channel | Online via citizen portal; assisted channel (Sewa Kendra) \- To be confirmed. |

## **3.2 Trigger & Preconditions**

Trigger:

Request to update ownership in PUDA records due to death of owner, based on will/succession/legal heir documentation.

Preconditions (to be validated):

* Property is identifiable in authority records (e.g., via UPN/Plot/Scheme).  
* Applicant possesses the required supporting documents listed in Section 10\.  
* Applicant is available to facilitate physical verification (as per portal note) \- details to be confirmed.  
* Original documents (e.g., death certificate/legal heir certificate) can be produced at the concerned authority as required.

## **3.3 Postconditions**

* Application is disposed (approved/rejected) and final decision is recorded with remarks.  
* If approved, ownership/record details are updated in the property master (integration dependent).  
* All workflow actions, documents, and decisions are retained in audit trail.  
* Applicant can download final output (where applicable) and view status history.

# **4\. Stakeholders and Roles**

## **4.1 External Users**

* Applicant/Citizen (registered user)  
* Legal heir(s)  
* Beneficiary/Transferee(s) (as per will/succession)

## **4.2 Internal Users (Role-based)**

* Clerk \- processes the application at assigned stage with role-specific permissions.  
* Senior Assistant \- processes the application at assigned stage with role-specific permissions.  
* Estate Officer \- processes the application at assigned stage with role-specific permissions.  
* System \- validations, routing, SLA tracking, notifications, output generation.

# **5\. Scope**

## **5.1 In Scope**

* Online application submission with document upload (where service is enabled).  
* Role-based internal processing workflow with query/rework loop.  
* SLA tracking, escalations, and audit trail.  
* Issuance of final output (approval/rejection) and applicant download.

## **5.2 Out of Scope (for this BRD)**

* Changes to underlying PUDA legal/policy rules not covered in service details.  
* Back-office manual processes outside the portal (unless explicitly integrated).  
* Payment reconciliation with treasury systems (unless confirmed for this service).

# **6\. Definitions & Acronyms**

| Term | Meaning |
| :---- | :---- |
| ARN | Application Reference Number |
| SLS/SLA | Service Level Standard / Service Level Agreement (time-bound processing) |
| UPN | Unique Property Number (as used by PUDA portals) |
| AEO | Assistant Estate Officer |
| DMS | Document Management System |
| RBAC | Role Based Access Control |

# **7\. Current Process (As-Is)**

Based on the service details page, the current process appears to be partially digital (online application and document upload) with possible physical steps such as physical verification and/or original document submission where noted. Detailed as-is process steps, offline registers, and counters/appointments require business confirmation.

# **8\. To-Be Process Overview (Digital)**

The digital process will enable online submission and tracking, automated task routing to internal roles, document management, verification capture (where required), and disposal within the published SLS. The workflow will support structured decisions (forward/query/approve/reject) and time-bound processing with escalations.

# **9\. Workflow Details**

The published processing sequence is: Submit Application \-\> Clerk (4 days) \-\> Senior Assistant (5 days) \-\> Estate Officer (6 days) \-\> Disposal.

## **9.1 Workflow Step Table**

| Step No | Actor | Inputs | Action | Output/Decision | Next State | SLS | Exceptions / Notes |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Applicant | Property & applicant details; required documents | Fill application form; upload documents; accept declaration; submit application | Application submitted; ARN generated (system) | Submitted | Immediate | If service is not yet enabled online, submission should be disabled with message (for portal). |
| 2 | System | Submitted application | Validate mandatory fields and required document presence; create workflow task for first role; send acknowledgement | Task assigned to Clerk; acknowledgement to applicant | Pending at Clerk | Immediate | Auto-validation rules (e.g., UPN lookup) \- to be confirmed. |
| 3 | Clerk | Application package \+ remarks | Review application and documents; record remarks; if physical verification is required, initiate/record verification (assumption); forward to next role OR raise query OR reject | Forwarded / Query raised / Rejected | Pending at Senior Assistant OR Query Pending OR Rejected | 4 Days | Physical verification/original document checks may be mandatory before approval (confirm). |
| 4 | Applicant (if query raised) | Query/deficiency memo from authority | Provide clarification; correct fields; re-upload document(s) if required; resubmit | Resubmitted application | Resubmitted to Clerk | TBD | Query response time window and SLA pause/reset rules \- Open Question. |
| 5 | Senior Assistant | Application package \+ remarks | Review application and documents; record remarks; forward to next role OR raise query OR reject | Forwarded / Query raised / Rejected | Pending at Estate Officer OR Query Pending OR Rejected | 5 Days | Physical verification/original document checks may be mandatory before approval (confirm). |
| 6 | Applicant (if query raised) | Query/deficiency memo from authority | Provide clarification; correct fields; re-upload document(s) if required; resubmit | Resubmitted application | Resubmitted to Senior Assistant | TBD | Query response time window and SLA pause/reset rules \- Open Question. |
| 7 | Estate Officer | Application package \+ remarks | Review application and documents; record remarks; approve/reject | Approved / Rejected | Approved OR Rejected | 6 Days | Physical verification/original document checks may be mandatory before approval (confirm). |
| 8 | System | Final decision | Generate digitally signed/approved output (order/permission/certificate as applicable); update records; close application; notify applicant | Output generated; application closed | Closed | Same day | Integration with property master, document signing and dispatch \- to be confirmed. |
| 9 | Applicant | Disposed application | Download/print output; view final status and history | Output downloaded | Closed | NA | If physical originals submission is required, it must be communicated to applicant (Open Question). |

## **9.2 State Model**

| State | Description | Entry Trigger | Exit Trigger | Allowed Transitions |
| :---- | :---- | :---- | :---- | :---- |
| Draft | Application is being filled by applicant; not yet submitted. | Create new application | Submit | Draft \-\> Submitted; Draft \-\> Cancelled |
| Submitted | Application submitted; system validations and assignment pending/complete. | Submit | Auto-assign | Submitted \-\> Pending at Clerk |
| Pending at Clerk | Application under processing by Clerk. | Auto-assign/forward | Forward / Query / Reject | Forward to next role OR Query Pending OR Rejected |
| Pending at Senior Assistant | Application under processing by Senior Assistant. | Auto-assign/forward | Forward / Query / Reject | Forward to next role OR Query Pending OR Rejected |
| Pending at Estate Officer | Application under processing by Estate Officer. | Auto-assign/forward | Forward / Query / Reject / Approve | Approved OR Rejected |
| Query Pending | Applicant must respond to a query/deficiency. | Query raised | Resubmit/timeout | Query Pending \-\> Resubmitted; Query Pending \-\> Rejected/Closed (timeout \- TBD) |
| Resubmitted | Applicant resubmitted after query. | Resubmit | Assign back | Resubmitted \-\> Pending at Clerk (same stage) |
| Approved | Application approved; output issuance pending/completed. | Approve | System closure | Approved \-\> Closed |
| Rejected / Closed | Application rejected or disposed and closed. | Reject or close | NA | Terminal state |

# **9A. Data Requirements (DR)**

## **9A.1 Key Entities & Attributes**

| Entity | Key Attributes / Notes |
| :---- | :---- |
| Application | ARN, service, authority, submission date/time, current state, SLA timers, final decision, remarks. |
| Applicant | Citizen profile reference; captured name and contact details. |
| Property | UPN/plot identifiers, scheme, property type, usage type. |
| Legal Heir/Beneficiary | Multiple legal heirs/beneficiaries, relationships, shares (if applicable). |
| Document | Document type, file metadata, checksum/hash, version, verification status, verifier remarks. |
| Workflow Task | Role/stage, assignee, start/end timestamps, action taken, comments, SLA status. |
| Audit Log | Immutable event log: who did what, when, from which channel/IP, including document and decision events. |

## **9A.2 Field List Grouped by Screen/Step**

Fields are derived from the published form on the service details page; confirm any additional fields not visible in the input capture.

| Screen/Step | Field Group | Fields | Ownership & Editability |
| :---- | :---- | :---- | :---- |
| 1 | Property Details | UPN; Area; Authority Name; Plot Number; Property Type; Scheme Name (as applicable) | Citizen enters/selects; some may be auto-fetched from Property Master (Assumption). Editable in Draft; locked after submit unless query. |
| 2 | Applicant Details | Full Name; Mobile; Email; Address (as available) | Citizen-provided or prefilled from profile (Assumption). Editable in Draft; locked after submit unless query. |
| 3 | Legal Heir / Beneficiary Details | Legal heir table: Name; Relationship with deceased; Mobile; Email; Beneficiary mapping; Will/succession details (as applicable) | Citizen enters; supports multiple legal heirs/beneficiaries. |
| 4 | Declarations | Undertaking/affidavit declarations as per service; consent to terms | Citizen must accept before submit; not editable after submit. |

## **9A.3 Data Validations & Mandatory Rules**

* UPN/Plot identifiers should follow configured formats; invalid values must be rejected.  
* Mandatory document types must be uploaded before submit.  
* Email and mobile formats must be validated.  
* File validations: allowed types (PDF/JPG/PNG), maximum size, virus scan, and readability check.  
* For will-based cases, translated copy is required when will language is not English/Hindi/Punjabi (as per service details).

## **9A.4 Data Retention & Archival Flags**

| Data Class | Description | Retention (TBD) | Archival Notes |
| :---- | :---- | :---- | :---- |
| Operational Records | Application data, workflow tasks, and issued outputs for day-to-day service delivery. | TBD (confirm retention period) | Archivable after retention period. |
| Audit Records | Audit logs, decision history, document versions, access logs. | TBD (confirm retention period) | Retain longer for audit/legal purposes. |
| Archival Records | Closed applications beyond retention moved to archival storage. | TBD | Retrievable for audit; limited access. |

## **9A.5 Data Requirements (DR) \- Requirement List**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| DR-01 | The system shall store Application master data including ARN, service, authority, submission date/time, current state, and SLA timers. | Must | Application record is created with all mandatory system fields; audit timestamps are populated. |
| DR-02 | The system shall store structured Property details including UPN/Plot/Scheme identifiers and property type fields as per the form. | Must | Property fields are persisted and retrievable; validation rules are enforced. |
| DR-03 | The system shall store Applicant profile reference and captured applicant details for the application. | Must | Applicant contact details are stored and can be used for notifications. |
| DR-04 | The system shall store Document metadata including document type, file name, size, checksum/hash, version, and verification status. | Must | Document records are created per upload; checksum is computed; version increments on re-upload. |
| DR-05 | The system shall store Workflow Task data including role, assignee, action taken, remarks, and start/end timestamps. | Must | Every task transition creates/updates task records and is visible in audit/history. |
| DR-06 | The system shall support retention flags for operational vs audit records, with archival rules configurable. | Should | Records older than retention period can be archived; retrieval for audit remains possible as per policy. |

# **10\. Document Requirements**

The following documents are required as per the service details page. Originals submission requirements (if any) must be captured as business rules and communicated to applicant.

| Doc ID | Document Name | Provided By | Mandatory | Stage | Validation/Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| DOC-01 | Original Death Certificate of the deceased owner. Original to be submitted at concerned authority | Applicant | Yes | Submission | File format/size to be configured; verify authenticity and legibility. |
| DOC-02 | Attested Copy of unregistered will In case, the Will is in a language, other than English, Hindi or Punjabi, a translated copy of the will in English or Punjabi is also be attached. | Applicant | Yes | Submission | File format/size to be configured; verify authenticity and legibility. |
| DOC-03 | No objection Affidavits from all left-out legal heirs if the property is bequeathed to one of legal hei or anyone outside family on basis of will | Applicant | Yes | Submission | File format/size to be configured; verify authenticity and legibility. |
| DOC-04 | Clearance of previous mortgage/ Loan/ Redemption Deed | Applicant | Yes | Submission | File format/size to be configured; verify authenticity and legibility. |
| DOC-05 | Liability Affidavit of beneficiaries of the Will | Applicant | Yes | Submission | File format/size to be configured; verify authenticity and legibility. |
| DOC-06 | Affidavits of attesting witnesses in the attached prescribed format. | Applicant | Yes | Submission | File format/size to be configured; verify authenticity and legibility. |

# **11\. Functional Requirements (FR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| FR-01 | The system shall allow an applicant to create a new application for this service and save it as Draft. | Must | Applicant can start application, save draft, and resume later; draft is visible in 'My Applications'. |
| FR-02 | The system shall capture property identification details (e.g., UPN/Plot/Scheme) and applicant details as per the service form. | Must | Mandatory fields are captured and stored; invalid formats are rejected with clear error messages. |
| FR-03 | The system shall allow the applicant to upload required documents by document type before submission. | Must | Only allowed file types/sizes are accepted; each required document type shows status (uploaded/missing). |
| FR-04 | On submission, the system shall validate mandatory fields and required document presence. | Must | Submission is blocked until mandatory fields and required documents are provided. |
| FR-05 | On successful submission, the system shall generate an Application Reference Number (ARN) and acknowledgement. | Must | ARN is unique; acknowledgement is available for download and sent via notification. |
| FR-06 | If any fee is configured for this service, the system shall support fee collection and receipt generation. | Could | When enabled, fee payment and receipt generation work end-to-end; otherwise the feature is not shown. |
| FR-07 | The system shall auto-assign the submitted application to the first internal processing role as per configured workflow. | Must | First task is created and visible in the role inbox; assignment timestamp is recorded. |
| FR-08 | The system shall allow internal users to view application data, uploaded documents, and history with role-based access. | Must | Authorized users can view; unauthorized access is denied and logged. |
| FR-09 | The system shall support actions at each internal stage: Forward, Raise Query (deficiency), Reject, and Approve (where applicable). | Must | Selected action transitions the application to the correct next state and records remarks. |
| FR-10 | The system shall support query/rework loop, allowing applicant to resubmit with corrected information and revised documents. | Must | Applicant can respond to query; system maintains versioning of submissions and documents. |
| FR-11 | The system shall support capturing physical verification requirement, outcome, and supporting report (if applicable). | Should | A verification record can be created/updated by authorized users and is visible to approvers. |
| FR-12 | On final decision, the system shall generate the disposal output (approval/rejection order/permission/certificate) and close the application. | Must | Output is generated and downloadable; final state is Closed; applicant is notified. |
| FR-13 | The system shall provide status tracking to applicant, including current state, pending role/stage, and SLA countdown (where applicable). | Must | Applicant can view real-time status; SLA timers are displayed consistently with business rules. |
| FR-14 | The system shall maintain a complete audit trail of application actions, document uploads, and decisions. | Must | Audit trail is immutable and queryable by authorized auditors. |
| FR-15 | The system shall support appointment/visit scheduling where original documents must be submitted physically (if required). | Could | If enabled, applicant can book an appointment slot and receive confirmation; otherwise this is not shown. |

# **12\. Non-Functional Requirements (NFR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| NFR-01 | Availability: Citizen portal shall be available 24x7 with planned maintenance windows. | Should | Uptime and maintenance windows are monitored and reported. |
| NFR-02 | Performance: Key portal actions (login, application save/submit, status view) should respond within 3 seconds under normal load. | Should | Performance tests meet response time targets at agreed concurrency. |
| NFR-03 | Security: Role-based access control (RBAC) shall restrict internal actions to authorized roles only. | Must | RBAC policy is enforced; unauthorized access attempts are blocked and logged. |
| NFR-04 | Security: All documents shall be stored encrypted at rest and transmitted over TLS. | Must | Encryption at rest and TLS are verified via security review. |
| NFR-05 | Privacy: Personally identifiable information (PII) shall be displayed only to authorized users and masked in logs. | Must | PII masking is applied to logs and exports. |
| NFR-06 | Reliability: The system shall ensure idempotency for submission and payment callbacks to prevent duplicate applications/receipts. | Should | Duplicate submissions do not create duplicate ARNs; payment callbacks are handled safely. |
| NFR-07 | Usability: Forms shall include field-level validation messages and contextual help for documents and declarations. | Should | User testing confirms clarity; error messages are actionable. |
| NFR-08 | Accessibility: Web portal shall follow WCAG 2.1 AA guidance for core flows. | Could | Accessibility audit finds no critical issues in core flows. |
| NFR-09 | Auditability: All workflow transitions and document operations shall be auditable with timestamp and user identity. | Must | Audit reports can reconstruct the full history of an application. |
| NFR-10 | Data Protection: The solution shall implement secure backups and disaster recovery as per government IT policy (TBD). | Should | Backup/restore drills meet RPO/RTO targets agreed with PUDA IT. |

# **12A. Audit & Compliance Requirements**

## **12A.1 Audit Trail Events**

* Application created, draft saved, submitted, cancelled.  
* Document uploaded/re-uploaded/deleted (if allowed), with checksum/hash captured.  
* Workflow task assigned/re-assigned; action taken (forward/query/reject/approve) with remarks.  
* Payment initiated/success/failure (if applicable).  
* Issued output generated, digitally signed, downloaded.  
* SLA breach events and escalations triggered.

## **12A.2 Document Integrity & Versioning**

* Maintain version history for each document type across re-uploads.  
* Store cryptographic hash/checksum per uploaded file to detect tampering.  
* Issued outputs must be tamper-evident (digital signature or QR/hash verification).

## **12A.3 Access Logging & Role-based Viewing**

* Log each access to an application and document (who, when, from where/IP, action).  
* Restrict viewing/editing based on role and assigned task; enable auditor/admin read-only access.  
* Provide masking of sensitive fields in logs and exports.

## **12A.4 Retention & Archival**

* Retention periods for operational records, audit logs, and documents to be confirmed with PUDA.  
* Support archival of closed applications and retrieval for audit/legal purposes.  
* Ensure backups and DR policies align with government IT policy (TBD).

# **13\. Business Rules (BR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| BR-01 | An application shall not be accepted for processing unless all mandatory fields and required documents are provided. | Must | System blocks submission until completeness checks pass. |
| BR-02 | Where portal indicates 'Physical verification required', the application shall not be finally approved unless the verification is completed and recorded. | Should | Approver cannot approve unless verification status is marked Completed (or an allowed bypass is configured). |
| BR-03 | Fee applicability and fee amount (if any) for this service shall be configurable and confirmed by business. | Should | If configured, fee is applied; if not, service remains free. |
| BR-04 | A query/deficiency shall pause or reset SLA clocks as per configured SLA policy. | Should | SLA handling behaves as per agreed policy; policy is documented and tested. |
| BR-05 | Rejection shall require mandatory remarks and shall be visible to applicant. | Must | Reject action cannot be submitted without remarks; applicant can view rejection reason. |
| BR-06 | Original documents marked 'Original to be submitted at authority' shall be physically verified and recorded before final approval. | Should | Verifier records original document check; approval is gated per configuration. |

# **14\. Integrations (IR)**

| ID | Integration Requirement | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| IR-01 | Integration with Property Master / Estate Management system for UPN/property lookup and record update on approval (where applicable). | Should | System can fetch property details by UPN; on approval, updates are posted and acknowledged. |
| IR-02 | Integration with Document Management System (DMS) for secure storage, retrieval, and versioning of uploaded documents. | Must | Documents are stored in DMS and accessible via secure links; versioning is retained. |
| IR-03 | Integration with SMS/Email gateway for notifications to applicant and internal users. | Must | Configured notification events trigger SMS/email; failures are logged and retried. |
| IR-04 | If online payment is introduced for this service, integrate with Payment Gateway and Treasury/GRAS as applicable (TBD). | Could | Payment integration can be enabled without code changes, based on configuration. |
| IR-05 | Integration with e-Sign/Digital Signature service for digitally signing issued letters/certificates. | Should | Issued documents can be digitally signed and carry verifiable signature. |

# **15\. Notifications & Communication**

## **15.1 Notification Events**

| Notif ID | Event | Recipient | Channel | Content (summary) |
| :---- | :---- | :---- | :---- | :---- |
| N-01 | Application submitted | Applicant | SMS/Email/In-app | ARN and acknowledgement link |
| N-02 | Query raised | Applicant | SMS/Email/In-app | Query details and resubmission link |
| N-03 | Application approved | Applicant | SMS/Email/In-app | Approval outcome and download link |
| N-04 | Application rejected | Applicant | SMS/Email/In-app | Rejection reason and next steps |
| N-05 | SLA breach/escalation | Internal supervisor (TBD) | Email/In-app | Pending application details and breach duration |

## **15.2 Sample Notification Templates (Indicative)**

Note: Templates are indicative recommendations; final content to be approved by PUDA.

* Application Submitted

Subject: PUDA \- Application Submitted (ARN: {ARN})  
Message: Your application for {SERVICE} has been submitted successfully. ARN: {ARN}. Track status at: {PORTAL\_LINK}.

* Query Raised

Subject: PUDA \- Query Raised (ARN: {ARN})  
Message: A query has been raised on your application {ARN}. Please respond and resubmit within {DAYS} days. View details at: {PORTAL\_LINK}.

* Approved

Subject: PUDA \- Approved (ARN: {ARN})  
Message: Your application {ARN} has been approved. Download the issued document here: {DOWNLOAD\_LINK}.

* Rejected

Subject: PUDA \- Rejected (ARN: {ARN})  
Message: Your application {ARN} has been rejected. Reason: {REASON}. For details, visit: {PORTAL\_LINK}.

# **16\. Reporting & MIS (REP)**

| ID | Report Requirement | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| REP-01 | System shall provide a service-wise dashboard showing total applications, pending by stage, and disposed counts. | Must | Dashboard filters by date range, authority, and service; numbers match backend data. |
| REP-02 | System shall provide SLA breach report by stage and overall disposal time. | Should | Report lists breached applications with timestamps and responsible stage. |
| REP-03 | System shall provide document deficiency/query report indicating common rejection/query reasons. | Could | Report aggregates reasons and supports export. |
| REP-04 | System shall provide user activity/audit report for internal users. | Should | Report lists actions by user and time; access restricted to admin/auditor. |

# **17\. SLAs/SLS, Escalation & Rework Rules**

## **17.1 Published SLS**

Published application disposal time (SLS): 30 Days (as per service details page).

| Stage/Role | Published Stage Time | Notes |
| :---- | :---- | :---- |
| Clerk | 4 Days | Stage actions: forward/query/reject/approve as applicable. |
| Senior Assistant | 5 Days | Stage actions: forward/query/reject/approve as applicable. |
| Estate Officer | 6 Days | Stage actions: forward/query/reject/approve as applicable. |

## **17.2 SLA Clock Handling (Recommendations)**

* Start overall SLA clock on successful submission (or on payment success if payment is mandatory).  
* Pause SLA while application is in 'Query Pending' (awaiting applicant response).  
* On resubmission, resume SLA for the same stage; optionally reset stage SLA based on business policy (Open Question).  
* Capture breach timestamp and escalate as per escalation matrix.

Note: The above are recommendations based on standard workflow practice; confirm PUDA policy for SLA pause/reset and applicant response time windows.

## **17.3 Escalation Matrix (To be confirmed)**

| Escalation Level | Owner | Trigger | Channel |
| :---- | :---- | :---- | :---- |
| Level 1 | Stage owner (role inbox) | When stage SLA breached (TBD) | In-app/email notification |
| Level 2 | Section head/Supervisor (TBD) | When breach \> X days (TBD) | Email \+ dashboard flag |
| Level 3 | Head of Department (TBD) | When breach \> Y days (TBD) | Escalation report |

## **17.4 Rework & Rejection Rules**

* Query can be raised at any internal stage; applicant resubmission returns to the same stage by default (recommendation).  
* Applicant response window (e.g., 7/15/30 days) and auto-closure rules to be confirmed with business.  
* Rejection must include remarks; rejected applications are terminal unless resubmission is explicitly allowed (policy TBD).

# **18\. Test Scenarios**

The following test scenarios cover happy path, rework, rejection, SLA breach, document mismatch, and payment failure where applicable.

| TC ID | Scenario | Preconditions | Steps (High-level) | Expected Result | Type |
| :---- | :---- | :---- | :---- | :---- | :---- |
| TC-01 | Happy path \- submit application and obtain approval | Applicant has required documents and valid property details. | Fill form \-\> Upload docs \-\> Submit \-\> All stages approve \-\> Output generated. | Application reaches Closed with Approved output downloadable. | Happy Path |
| TC-02 | Query/rework \- clerk raises query and applicant resubmits | Applicant submits with missing/incorrect detail. | Submit \-\> Clerk raises query \-\> Applicant corrects and resubmits \-\> Processing continues. | Application returns to same stage and proceeds; document version updated. | Rework |
| TC-03 | Rejection at first stage | Applicant submits invalid/inauthentic document. | Submit \-\> Clerk rejects with remarks. | Application is Rejected/Closed; applicant sees rejection reason. | Rejection |
| TC-04 | Rejection at final stage | Discrepancy found in verification. | Submit \-\> Intermediate approvals \-\> Final approver rejects with reason. | Application is Rejected/Closed; audit trail shows final decision and remarks. | Rejection |
| TC-05 | SLA breach \- stage exceeds configured time | Workload causes delay in processing. | Submit \-\> Task remains pending beyond stage SLA. | SLA breach is flagged; escalation notification sent as configured; appears in SLA report. | SLA Breach |
| TC-06 | Document mismatch/invalid format | Applicant uploads wrong file type or corrupted file. | Upload document \-\> System validates. | Upload is rejected with error; user can re-upload correct document. | Validation |
| TC-07 | Submission without mandatory document | Applicant misses a mandatory document. | Attempt submit with missing doc. | System blocks submission and highlights missing document. | Validation |
| TC-08 | Concurrent edits \- applicant edits draft from two devices | Applicant logged in on two sessions. | Edit draft in session A and B \-\> Save. | System maintains last-save and warns about overwrites (recommendation) OR prevents conflicting updates (TBD). | Edge |
| TC-09 | Internal user access control | User without required role attempts to open task. | Login as unauthorized internal user \-\> Try access application/task. | Access denied; attempt logged. | Security |
| TC-10 | Notification delivery | Notifications are configured and gateways available. | Submit \-\> System sends acknowledgement \-\> Later state changes \-\> Final disposal. | Applicant receives notifications for key events; failures retried/logged. | Communication |
| TC-11 | Document re-upload after query | Query asks for revised affidavit/document. | Respond to query \-\> Re-upload document \-\> Resubmit. | New document version stored; previous version retained for audit. | Rework |
| TC-12 | System generated output integrity | Approved application disposed. | Approve \-\> System generates output with digital signature. | Output is verifiable, tamper-evident (hash/signature), and downloadable. | Output |

# **19\. Traceability Matrix, Risks, Dependencies, Assumptions & Open Questions**

## **19.1 Traceability Matrix**

| Workflow Step | Step Name | Mapped Requirements (FR/BR/DR/IR/NFR/REP) | Mapped Test Cases |
| :---- | :---- | :---- | :---- |
| Step 1 | Applicant \- Fill application form; upload documents;... | FR-01; FR-03; DR-01; NFR-03 | TC-01; TC-02; TC-03 |
| Step 2 | System \- Validate mandatory fields and required d... | FR-01; FR-03; DR-01; NFR-03 | TC-01; TC-02; TC-03 |
| Step 3 | Clerk \- Review application and documents; record... | FR-01; FR-03; DR-01; NFR-03 | TC-01; TC-02; TC-03 |
| Step 4 | Applicant (if query raised) \- Provide clarification; correct fields; r... | FR-01; FR-03; DR-01; NFR-03 | TC-01; TC-02; TC-03 |
| Step 5 | Senior Assistant \- Review application and documents; record... | FR-01; FR-03; DR-01; NFR-03 | TC-01; TC-02; TC-03 |
| Step 6 | Applicant (if query raised) \- Provide clarification; correct fields; r... | FR-01; FR-03; DR-01; NFR-03 | TC-01; TC-02; TC-03 |
| Step 7 | Estate Officer \- Review application and documents; record... | FR-01; FR-03; DR-01; NFR-03 | TC-01; TC-02; TC-03 |
| Step 8 | System \- Generate digitally signed/approved outpu... | FR-01; FR-03; DR-01; NFR-03 | TC-01; TC-02; TC-03 |
| Step 8 | System \- Output generation/closure | FR-12; IR-05; NFR-09; REP-01 | TC-01; TC-12 |

## **19.2 Dependencies**

* Availability of Property Master data and UPN lookup services.  
* Configured role hierarchy and user master for internal roles.  
* DMS, notification gateways, and (if applicable) payment gateway integrations.  
* Digital signature/e-sign service for issued outputs.

## **19.3 Risks**

* Mismatch between published SLS and sum of stage timelines (where observed) may require clarification and reconfiguration.  
* Physical verification/original document submission steps are not fully defined in input; may impact process design and SLS adherence.  
* Incomplete fee details (where fee receipt is required but amount not specified) may delay payment module configuration.

## **19.4 Assumptions**

* Applicant authentication and basic citizen profile (mobile/email) are available on the portal.  
* Standard workflow actions (forward/query/reject/approve) are supported by the workflow engine.  
* Issued outputs will be available as downloadable PDFs with digital signature/QR verification (recommendation).  
* Stage roles and timelines listed are taken from the service details page captured in the input PDF.

## **19.5 Open Questions for Business Confirmation**

* Confirm owning department and internal role mapping for this service across authorities (PUDA/GMADA/GLADA/BDA).  
* Confirm detailed field list and validations (including any hidden or conditional fields not visible in input capture).  
* Confirm fee applicability, fee heads, exemptions, and payment modes (online/offline) for this service.  
* Confirm physical verification process: which role performs it, required evidence, and whether it gates approval.  
* Confirm SLA clock rules: pause/reset during query, applicant response time window, and auto-closure policy.  
* Confirm output format (order/letter/certificate), signing authority, and whether manual dispatch is required.

## **19.6 References**

PUDA Service Details Page: https://www.puda.gov.in/service-details/26 (captured in input PDF).

Industry-standard workflow recommendations are included without asserting PUDA policy; where not in input, items are marked as assumptions or open questions.