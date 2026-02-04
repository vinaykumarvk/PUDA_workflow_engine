Business Requirement Document (BRD)

Service: Issue of Re-allotment Letter

Project: PUDA Citizen Services Portal & Mobile App  
Version: 1.0 (Draft)  
Date: 02 Feb 2026  
Prepared by: Senior Business Analyst

# **1\. Document Control & Approvals**

Document Title: BRD \- Issue of Re-allotment Letter

Owning Department: Estate/Property Branch (Assumption \- confirm with PUDA)

Primary Source of Truth: PUDA portal 'Issue of Re-allotment Letter' service details (Service ID 32), accessed 02 Feb 2026\.

Application Disposal Time (SLS): 10 Days (as published on service details page).

## **1.1 Version History**

| Version | Date | Prepared By | Change Summary | Status |
| :---- | :---- | :---- | :---- | :---- |
| 1.0 | 02 Feb 2026 | Senior Business Analyst | Initial draft based on published PUDA service details page. | Draft |

## **1.2 Review & Approval**

| Name | Role | Department/Organisation | Review Comments | Approval (Yes/No) |
| :---- | :---- | :---- | :---- | :---- |
| Business Owner | Service Owner | PUDA (To be confirmed) |  |  |
| Process Owner | Branch Head | PUDA (To be confirmed) |  |  |
| IT Owner | Product/IT | PUDA/Implementation Partner (To be confirmed) |  |  |

# **2\. Executive Summary**

The 'Issue of Re-allotment Letter' service enables a citizen/applicant to apply online for issuance of Re-allotment Letter related outputs for a property managed by the authority. The digital workflow supports role-based scrutiny, document submission and verification, time-bound processing as per published Service Level Standards (SLS), and transparent status tracking for the applicant.

# **3\. Service Overview**

## **3.1 Service Metadata**

| Attribute | Value |
| :---- | :---- |
| Service Name | Issue of Re-allotment Letter |
| Service Category | Property/Plot Services |
| Authorities | PUDA, GMADA, GLADA, BDA (as displayed on portal header) |
| Portal Service URL | https://www.puda.gov.in/service-details/32 |
| Application Disposal Time (SLS) | 10 Days |
| Workflow Roles | Submit Application \-\> Clerk (\~4 Days) \-\> Senior Assistant (\~3 Days) \-\> Assistant Estate Officer (AEO) (\~3 Days) \-\> Disposal |
| Document(s) Required | Transfer permission before Conveyance Deed (Original to be submitted at Authority if issued manually) |
| Physical Verification | Required (as indicated for the required document on the service page). |
| Output | Re-allotment Letter issued (PDF) on approval; rejection order on rejection (format/signing to be confirmed). |
| Channel | Online via citizen portal; assisted channel (e.g., Sewa Kendra) \- To be confirmed. |

## **3.2 Trigger & Preconditions**

Trigger:

Request by applicant for Re-allotment Letter related service for a property in authority records.

Preconditions (to be validated):

\- Property exists in authority records and is identifiable via UPN/Plot/Scheme.  
\- Applicant is eligible to apply (owner/allottee/transferee/authorised representative) \- Open Question.  
\- Required documents are available for upload as per service document checklist.

## **3.3 Postconditions**

\- On approval, Re-allotment Letter output is issued and made available for applicant download (Assumption \- format/signing to be confirmed).  
\- On rejection, a rejection order is issued with reason and the application is disposed.  
\- Application is marked Closed with complete audit trail and decision history.

# **4\. Stakeholders and Roles**

## **4.1 External Users**

\- Applicant/Citizen: Submits application and uploads documents.  
\- Authorised Representative (if applicable): Applies on behalf of applicant using GPA/Sub Attorney (where relevant).

## **4.2 Internal Users (Role-based)**

| Role | Primary Responsibilities | System Access | SLS Allocation |
| :---- | :---- | :---- | :---- |
| Clerk | Initial scrutiny; verify property and applicant details; ensure transfer permission is attached; forward/raise query/reject (assumed). | Internal portal dashboard | 4 Days |
| Senior Assistant | Secondary scrutiny; verify transfer permission and transferee details; forward to AEO or raise query/reject (assumed). | Internal portal dashboard | 3 Days |
| Assistant Estate Officer (AEO) | Final review and disposal; approve/reject; ensure original manual document (if any) is submitted as required. | Internal portal dashboard | 3 Days |
| System | Auto-validation, ARN generation, task assignment, SLA tracking, notifications, and output generation on approval/rejection. | Backend services | Immediate/NA |

# **5\. Scope**

## **5.1 In Scope**

\- Citizen-facing online application form for Issue of Re-allotment Letter including required fields and document upload.  
\- Workflow automation and role-based processing as per published roles/stages.  
\- SLA/SLS tracking as per published timelines; escalation rules as configurable (recommendation).  
\- Document storage, verification status capture, and versioning during query/resubmission.  
\- Notifications and application status tracking for citizens and internal staff (as configured).  
\- Disposal output generation and download (approval/rejection order; and certificate/letter where applicable) \- output templates to be confirmed.

## **5.2 Out of Scope (for this BRD)**

\- Policy definition beyond what is published on the service details page.  
\- Manual back-office processes not referenced in the input (e.g., physical file movement) except capturing physical verification flags/status.  
\- Fee schedules, exemptions, and legal validations not provided in the input (to be confirmed).

# **6\. Definitions & Acronyms**

| Term | Definition |
| :---- | :---- |
| PUDA | Punjab Urban Planning & Development Authority. |
| GMADA/GLADA/BDA | Other authorities shown on portal header; applicability to be confirmed per service. |
| UPN | Unique Property Number used to identify properties in authority records. |
| ARN | Application Reference Number generated by the system on submission. |
| SLS/SLA | Service Level Standard / Service Level Agreement timelines for disposal and stage processing. |
| AEO | Assistant Estate Officer. |
| Transfer Permission (Before CD) | Permission issued by authority prior to Conveyance Deed; mandatory input document. |
| Transferee | Person(s) in whose favour re-allotment letter is issued. |

# **7\. Current Process (As-Is)**

The detailed existing (as-is) process is not provided in the input. It is assumed that the legacy process involved physical submission of documents and manual scrutiny within the concerned branch. This BRD focuses on digitising the published workflow and form. (Assumption \- confirm as-is steps and pain points in workshops.)

# **8\. To-Be Process Overview (Digital)**

The digital process will allow online submission and tracking, automated task routing to internal roles, document management, verification/inspection capture (where applicable), and disposal within 10 days as published. The workflow will support structured decisions (forward/query/approve/reject) and time-bound processing.

# **9\. Workflow Details**

The published processing sequence is: Submit Application \-\> Clerk (\~4 Days) \-\> Senior Assistant (\~3 Days) \-\> Assistant Estate Officer (AEO) (\~3 Days) \-\> Disposal.

## **9.1 Workflow Step Table**

| Step No | Actor | Inputs | Action | Output/Decision | Next State | SLS | Exceptions / Notes |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Applicant | Property details; Applicant details; Required documents | Fill application form, upload documents, and submit application. | Application submitted; ARN generated (system). | Submitted | Immediate | Eligibility, fee/payment (if any), and assisted channel rules are to be confirmed. |
| 2 | System | Submitted application | Validate mandatory fields and required document presence; create workflow task for Clerk; send acknowledgement. | Task assigned to Clerk; acknowledgement to applicant. | Pending at Clerk | Immediate | Auto-validation rules (UPN/Property lookup) depend on integrations to be confirmed. |
| 3 | Clerk | Application \+ uploaded documents | Initial scrutiny; verify property and applicant details; ensure transfer permission is attached; forward/raise query/reject (assumed). | Forwarded / Query raised / Rejected | Pending at Senior Assistant OR Query Pending OR Rejected | 4 Days | Required (as indicated for the required document on the service page). |
| 4 | Applicant | Query (if raised) from processing officer | Provide clarifications/corrections; re-upload document(s) if required; resubmit. | Resubmitted application. | Resubmitted to same stage | TBD | Response time window and SLA pause/reset rules are Open Questions. Query can be raised at any stage (assumption). |
| 5 | Senior Assistant | Application package \+ prior stage remarks | Secondary scrutiny; verify transfer permission and transferee details; forward to AEO or raise query/reject (assumed). | Forwarded / Query raised / Rejected | Pending at Assistant Estate Officer (AEO) OR Query Pending OR Rejected | 3 Days | If query is raised, application returns after resubmission (configurable). |
| 6 | Assistant Estate Officer (AEO) | Application package \+ verification records | Final review and disposal; approve/reject; ensure original manual document (if any) is submitted as required. Approve or reject with mandatory remarks. | Approved / Rejected | Approved OR Rejected | 3 Days | Final approval may be contingent on completion of physical verification/inspection (as applicable). |
| 7 | System | Final decision | Generate Re-allotment Letter output on approval and/or rejection order; close application; notify applicant. | Output generated; application closed. | Closed | Same day | Digital signing/QR and output format to be confirmed; treated as recommendation if implemented. |
| 8 | Applicant | Disposed application | Download output and view final status. | Download/print as needed. | Closed | NA | If physical pickup/original submission is required, portal must display instructions (Open Question). |

## **9.2 State Model**

| State | Description | Entry Trigger | Exit Trigger | Allowed Transitions |
| :---- | :---- | :---- | :---- | :---- |
| Draft | Citizen has started but not submitted. | Citizen saves application | Citizen submits | Draft \-\> Submitted |
| Submitted | Application submitted; ARN generated. | Successful submission | System routes to first stage | Submitted \-\> Pending at Clerk |
| Pending at Clerk | Application pending with Clerk for scrutiny. | System assigns task | Clerk forwards/query/reject | Pending at Clerk \-\> Query Pending / Pending at Senior Assistant / Rejected |
| Query Pending | Query raised; waiting for citizen resubmission. | Officer raises query | Citizen resubmits | Query Pending \-\> Resubmitted |
| Resubmitted | Citizen resubmitted after query. | Citizen resubmits | System routes back to stage that raised query | Resubmitted \-\> Pending at \<same stage\> |
| Pending at Senior Assistant | Application pending with Senior Assistant for review. | Forwarded to Senior Assistant | Senior Assistant forwards/query/reject | Pending at Senior Assistant \-\> Query Pending / Pending at Assistant Estate Officer (AEO) / Rejected |
| Pending at Assistant Estate Officer (AEO) | Application pending with Assistant Estate Officer (AEO) for final decision. | Forwarded to Assistant Estate Officer (AEO) | Assistant Estate Officer (AEO) approves/rejects | Pending at Assistant Estate Officer (AEO) \-\> Approved / Rejected |
| Approved | Application approved; output to be issued. | Final approval captured | System generates output and closes | Approved \-\> Closed |
| Rejected | Application rejected with reason. | Reject action captured | System closes case | Rejected \-\> Closed |
| Closed | Application disposed; final output available. | System closes application | NA | Terminal |

# **9A. Data Requirements (DR)**

## **9A.1 Key Entities & Attributes**

The system shall maintain the following key entities for the Issue of Re-allotment Letter service:

| Entity | Key Attributes / Notes |
| :---- | :---- |
| Application | ARN, service, authority, submission date/time, current state, SLA timers, final decision, remarks. |
| Applicant | Citizen profile reference; full name (as per form); contact details (from profile) \- to be confirmed. |
| Property | UPN, Area, Authority Name, Plot Number, Property Type, Scheme Name, Reserved Price, Sale Type, Usage Type. Property master linkage via UPN is assumed. |
| Transferee | Name, father name, address, mobile, email; supports multiple transferees. |
| Document | Document type, file metadata, checksum, version, verification status, verifier remarks. |
| Workflow Task | Role/stage, assignee, start/end timestamps, action taken, comments, SLA status. |
| Approval Decision | Decision (Approved/Rejected), decision date/time, deciding officer, reason/remarks. |
| Audit Log | Immutable event log: who did what, when, from which channel/IP, including document and decision events. |

## **9A.2 Field List Grouped by Screen/Step**

Fields are derived from the published form on the service details page.

| Screen/Step | Field Group | Fields | Ownership & Editability |
| :---- | :---- | :---- | :---- |
| Service Initiation | Authority & Service | Authority selection (PUDA/GMADA/GLADA/BDA), Service name | Citizen (editable) |
| Application Form | Applicant Details | Full Name | Citizen (editable before submit); read-only after submit |
| Application Form | Property Details | UPN, Area, Authority Name, Plot Number, Property Type, Scheme Name, Reserved Price, Sale Type, Usage Type | Citizen enters UPN/Plot; system may auto-fill other fields (Assumption) |
| Application Form | All Transferees Details | Transferee's Name, Father Name, Address, Mobile, Email | Citizen (one-to-many) before submit; read-only after submit |
| Application Form | Document Upload | DOC-01: Transfer permission before Conveyance Deed (Original to be submitted at Authority if issued manually) | Citizen uploads; internal can mark verified and add remarks |
| Internal Processing | Scrutiny & Remarks | Stage remarks, query text, decision reason, verification status | Internal users only; citizen view limited to query/decision summary |

## **9A.3 Data Validations & Mandatory Rules**

Mandatory fields and validations shall be applied as follows (items marked as Assumption/Open Question require business confirmation):

| Step | Data Element | Validation Rule | Source / Notes |
| :---- | :---- | :---- | :---- |
| Submission | UPN | Mandatory; must match property master if integration available (Assumption). | Property master integration to be confirmed. |
| Submission | Document upload | Allowed file types (PDF/JPG/PNG) and max size (configurable). | NFR/BR \- to be configured centrally. |
| Submission | DOC-01 transfer permission before CD | Mandatory; if issued manually, original must be submitted at authority (capture status). | As per service page note. |
| Submission | Mandatory fields | System shall block submission if mandatory fields/docs are missing. | Derived from published form and required documents list. |
| Processing | Rejection reason | Reject action requires mandatory reason/remarks by officer. | Best practice; confirm if required by PUDA policy. |

## **9A.4 Data Retention & Archival Flags**

Retention periods are not provided in the input and must be confirmed. The system shall support configurable retention flags:  
\- Operational data: required for active processing and citizen tracking.  
\- Audit data: immutable logs and decision history.  
\- Archival: long-term storage for legal/record purposes.  
Open Question: What is the mandated retention period for applications and documents for this service?

## **9A.5 Data Requirements (DR) \- Requirement List**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| DR-01 | System shall store application master data including ARN, service ID, authority, submission date/time, current state, and SLA timers. | Must | Application record is created with unique ARN and all required metadata. |
| DR-02 | System shall store property identifiers (UPN/Plot/Scheme) and link to property master where available. | Should | Property linkage is stored; discrepancies are flagged for review. |
| DR-03 | System shall store applicant-entered form data and lock citizen-editable fields after submission (except during query rework). | Must | Fields become read-only after submit; editable again only in query state. |
| DR-04 | System shall store uploaded documents with metadata (doc type, upload time, file size, MIME type) and version history. | Must | Document metadata is viewable by authorised users; re-uploads create new versions. |
| DR-05 | System shall compute and store checksums for uploaded documents to detect tampering. | Should | Checksum is stored at upload and verified on download/view. |
| DR-06 | System shall capture workflow task events including assignee, action, timestamps, comments, and SLA status. | Must | Task timeline is available and auditable. |
| DR-07 | System shall capture decision data (approve/reject), decision maker, date/time, and reason/remarks. | Must | Final decision record is complete and available to citizen/internal as per access rules. |
| DR-08 | System shall support retention flags for operational, audit, and archival datasets (retention period configurable). | Should | Retention configuration exists; archival flags are applied automatically. |
| DR-09 | System shall support export of application and SLA data for reporting/MIS. | Could | Authorised users can export reports without data loss or mismatch. |

# **10\. Document Requirements**

The following documents are required as per the published service details:

| Doc ID | Document Name | Provided By | Mandatory | Stage | Validation/Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| DOC-01 | Transfer permission before Conveyance Deed (Original to be submitted at Authority if issued manually) | Applicant | Must | Submission | Physical verification required; original submission requirement applies only for manually issued permission (as per service page). |

Open Question: Does PUDA require physical submission of original/certified documents at the authority office in addition to online upload? If yes, the portal must display clear instructions and capture 'Physical submission received' status.

# **11\. Functional Requirements (FR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| FR-01 | System shall allow citizens to select the Authority (PUDA/GMADA/GLADA/BDA) and initiate the 'Issue of Re-allotment Letter' service. | Must | Citizen can initiate the service for a selected authority. |
| FR-02 | System shall provide an online application form capturing Applicant Details and Property Details as per the published fields. | Must | All published fields are present and can be saved/submitted. |
| FR-03 | System shall allow capture of multiple transferees (one-to-many) under 'All Transferees Details'. | Must | Citizen can add/edit/remove multiple transferee entries before submission. |
| FR-04 | System shall allow upload of required documents (DOC-01) and store them securely with metadata and versioning. | Must | Upload succeeds for allowed formats; documents are retrievable by authorised users. |
| FR-05 | System shall enforce mandatory data/document validations before allowing final submission. | Must | Submission is blocked if mandatory fields or required documents are missing. |
| FR-06 | System shall generate an Application Reference Number (ARN) and acknowledgement receipt upon successful submission. | Must | ARN and acknowledgement are generated and visible/downloadable to applicant. |
| FR-07 | System shall provide application status tracking to citizens, including current stage, SLA status (optional), and decision history. | Must | Citizen can view status and timeline of actions. |
| FR-08 | System shall provide role-based internal dashboards for Clerk, Senior Assistant, Assistant Estate Officer (AEO) to view and process assigned cases. | Must | Internal users see only applications assigned to their role/queue as per RBAC. |
| FR-09 | 'Clerk' role user shall be able to review the application, record scrutiny remarks, and take action: Forward to next stage, Raise Query to Applicant, or Reject (Query/Reject are assumptions unless confirmed). | Should | Role user can perform actions and system changes status accordingly; actions are logged. |
| FR-10 | 'Senior Assistant' role user shall be able to review the application, record scrutiny remarks, and take action: Forward to next stage, Raise Query to Applicant, or Reject (Query/Reject are assumptions unless confirmed). | Should | Role user can perform actions and system changes status accordingly; actions are logged. |
| FR-11 | 'Assistant Estate Officer (AEO)' role user shall be able to review the application, record scrutiny remarks, and take action: Forward to next stage, Raise Query to Applicant, or Reject (Query/Reject are assumptions unless confirmed). | Must | Role user can perform actions and system changes status accordingly; actions are logged. |
| FR-12 | System shall support capturing verification/inspection completion status and remarks (including physical verification where required) before allowing final approval. | Must | Final approving role cannot approve unless required verification/inspection statuses are completed (configurable). |
| FR-13 | On approval, system shall generate the Re-allotment Letter output document and make it available for applicant download (Assumption). | Should | Downloadable output is generated and accessible to applicant and authorised staff. |
| FR-14 | On rejection, system shall generate a rejection order with reason and make it available to the applicant. | Should | Rejection order is downloadable and includes reason code/text. |
| FR-15 | System shall provide configurable SLA timers per stage (as per published durations) and calculate overall service disposal time (10 days). | Must | SLA clocks and breach flags are visible in dashboards and reports. |
| FR-16 | System shall send notifications (SMS/email/in-app) on submission, query, resubmission, approval, rejection, and SLA breach (internal). | Should | Notifications are triggered for each configured event and logged. |
| FR-17 | System shall allow authorised staff to search applications by ARN/UPN/Plot/Scheme and export lists to CSV/Excel. | Should | Search results are accurate and exportable. |
| FR-18 | System shall support assisted submission by authorised operators (e.g., Sewa Kendra) with an auditable marker of assisted channel (Assumption). | Could | Operator can submit on behalf of citizen and audit log captures assisted channel. |

# **12\. Non-Functional Requirements (NFR)**

| ID | Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| NFR-01 | System shall enforce role-based access control (RBAC) for all internal and citizen functions. | Must | Unauthorised users cannot view/process applications; access is logged. |
| NFR-02 | System shall support secure document storage with encryption in transit and at rest. | Must | Documents are served over TLS and stored encrypted; access is controlled. |
| NFR-03 | System shall provide an audit trail for key actions (submission, upload, view, decision, query). | Must | Audit records are immutable and searchable. |
| NFR-04 | System shall meet availability targets (to be confirmed) and provide graceful error handling. | Should | Downtime is within agreed SLA; user receives friendly error messages. |
| NFR-05 | Performance: citizen submission and status pages shall load within acceptable time (e.g., \<=3 seconds on 4G) (Recommendation). | Should | Measured response times meet targets under normal load. |
| NFR-06 | System shall support bilingual UI content (English/Punjabi) (Assumption \- confirm requirement). | Could | User can toggle language; key labels/messages translated. |
| NFR-07 | System shall be accessible per WCAG 2.1 AA (Recommendation). | Should | Accessibility audit passes agreed checks. |
| NFR-08 | System shall log and monitor SLA breaches and provide alerts to supervisors. | Must | Breach events are generated and visible in dashboards. |
| NFR-09 | System shall support disaster recovery and backups (RPO/RTO to be confirmed). | Should | Backups exist; DR drill demonstrates RPO/RTO. |
| NFR-10 | System shall support mobile-responsive web UI and mobile app parity for citizen functions. | Should | Citizen can complete end-to-end service on web and mobile. |

# **12A. Audit & Compliance Requirements**

## **12A.1 Audit Trail Events**

* Citizen login/logout; assisted channel marker (if applicable).  
* Application created, saved, edited, submitted, withdrawn/cancelled.  
* Document upload, replacement/version update, download/view by internal users.  
* Workflow assignment changes, forward actions, query issuance, resubmission events.  
* Decision events: approve/reject, with remarks and reason codes.  
* Verification/inspection status updates and verifier remarks.  
* System-generated outputs: acknowledgement, approval/rejection order generation, digital signing events (if used).  
* Notifications dispatched (SMS/email/in-app) including failures and retries.  
* Administrative configuration changes (SLA settings, document requirements, role mappings).

## **12A.2 Document Integrity & Versioning**

\- System shall compute and store checksums for uploaded documents to detect tampering.  
\- Documents shall be versioned during query/resubmission; older versions must remain accessible to authorised reviewers.

## **12A.3 Access Logging & Role-based Viewing**

\- All views/downloads of applicant documents must be logged (user, role, timestamp, IP/device).  
\- Citizen can view only their own applications.  
\- Internal users can view applications limited by role and authority jurisdiction (Open Question).

## **12A.4 Retention & Archival**

Retention/archival periods and legal compliance requirements are not provided in the input. The system shall support configurable retention rules for application data, documents, and audit logs. (Open Question: confirm retention and archival policy.)

# **13\. Business Rules (BR)**

| ID | Rule Description | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| BR-01 | Overall service disposal time shall be 10 days (as published on service details page). | Must | System SLA calculation shows total processing within published SLS for non-query cases. |
| BR-02 | Stage-wise SLS shall be as published: Clerk 4 days, Senior Assistant 3 days, Assistant Estate Officer (AEO) 3 days. | Must | SLA timer per stage is configured to published values and breach is flagged. |
| BR-03 | Document submission rules shall be enforced as per published service requirements. Mandatory documents: DOC-01. | Must | System blocks submission when mandatory conditions are not met. |
| BR-04 | DOC-01 (Transfer permission before CD) is mandatory; if issued manually, original must be submitted at Authority (capture receipt status \- Open Question). | Must | System captures original-received status and enforces as configured. |
| BR-05 | Where service page indicates physical verification is required, verification status must be captured before final approval. | Must | Final approving officer cannot approve unless required verification is marked completed (configurable). |
| BR-06 | Rejection shall require mandatory reason/remarks captured by the rejecting officer. | Must | Reject action cannot be completed without reason/remarks. |
| BR-07 | Only the assigned role/stage owner shall be able to process an application at that stage. | Must | RBAC prevents unauthorised actions; audit shows blocked attempts. |
| BR-08 | When a query is raised, the application shall move to 'Query Pending' and return to the same stage upon resubmission. | Should | Query/resubmission loop works and stage is preserved. |
| BR-09 | SLA clock treatment during query/resubmission (pause vs reset) shall be configurable. | Should | Configuration exists and reports reflect chosen SLA policy. |
| BR-10 | If any fee/payment is applicable for this service (not provided in input), processing shall start only after successful payment. | Could | Applications with payment pending are not routed to processing stages; they move after payment success. |
| BR-11 | All decisions and actions shall be time-stamped and auditable. | Must | Audit log contains timestamps for each action. |

# **14\. Integrations (IR)**

| ID | Integration Requirement | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| IR-01 | Integration with authentication/identity management for citizen login and internal staff login. | Must | Users can authenticate and sessions are securely managed. |
| IR-02 | Integration with Property Master/UPN database to fetch/validate property details (Assumption \- confirm availability). | Should | Property details can be fetched/validated using UPN/Plot identifiers. |
| IR-03 | Integration with Document Management/Storage service for secure upload, storage, and retrieval. | Must | Documents are stored securely and are retrievable with RBAC. |
| IR-04 | Integration with SMS and Email gateway for notifications. | Must | Notifications are successfully sent and failures are retried/logged. |
| IR-05 | Integration with workflow/queue management for role-based task assignment and escalation. | Must | Tasks route correctly and escalations trigger on breach. |
| IR-06 | Integration with Transfer Permission (Before CD) records to validate permission details (Assumption). | Could | Reviewer can view permission record or system can validate key fields. |
| IR-07 | Integration with digital signature/eSign service for issuance of digitally signed re-allotment letter (Recommendation). | Should | Output PDF includes digital signature/QR for validation. |
| IR-08 | Integration with helpdesk/ticketing for citizen support (Recommendation). | Could | Citizen can raise ticket linked to application. |

# **15\. Notifications & Communication**

| Event | Recipient | Channel | Content (Summary) |
| :---- | :---- | :---- | :---- |
| Application Submitted | Applicant | SMS/Email/In-app | Acknowledgement with ARN and next steps. |
| Query Raised | Applicant | SMS/Email/In-app | Query details, required action, and resubmission instructions. |
| Application Resubmitted | Applicant \+ Stage Owner | In-app/Email | Confirmation of resubmission and routing back to stage. |
| Approved | Applicant | SMS/Email/In-app | Approval notification and link to download Re-allotment Letter output. |
| Rejected | Applicant | SMS/Email/In-app | Rejection notification with reason summary and next steps. |
| SLA Breach | Supervisor/Branch Head | Email/In-app | Escalation alert with application list and breached stage. |
| Document View/Download (Internal) | Compliance/Audit | Log only | System logs document access for audit; no user-facing notification. |

# **16\. Reporting & MIS (REP)**

| ID | Report/Metric | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| REP-01 | Daily applications received by authority/service | Must | Report shows count by date, authority, and channel. |
| REP-02 | Pending applications by stage/role | Must | Report shows queue size and aging per role. |
| REP-03 | Disposed applications by outcome (approved/rejected) | Must | Report shows counts and percentages for outcomes. |
| REP-04 | Average turnaround time (TAT) and percentile TAT | Should | Report shows TAT and breakdown by stage. |
| REP-05 | SLA breach report by stage and officer | Must | Report lists breached cases with timestamps and responsibility. |
| REP-06 | Document deficiency/query analytics | Could | Report lists common query reasons and documents causing rework. |
| REP-07 | Issuance register \- Re-allotment Letter outputs issued | Should | Register contains ARN, property, applicant, issue date, and output reference. |

# **17\. SLAs/SLS, Escalation & Rework Rules**

## **17.1 Published SLS**

As per the portal, overall application disposal time is 10 days with stage-wise allocation: Clerk 4 days, Senior Assistant 3 days, Assistant Estate Officer (AEO) 3 days.

## **17.2 SLA Clock Handling (Recommendations)**

\- SLA timer starts when application is successfully submitted (and payment is successful if fees apply).  
\- If a query is raised, the SLA clock may be paused until citizen resubmits (recommended). This must be confirmed and made configurable.  
\- System shall capture breach timestamps and support escalation notifications to supervisors.

## **17.3 Escalation Matrix (To be confirmed)**

The input does not provide escalation roles. Recommended approach:  
\- If a stage exceeds its SLS: notify the next higher role/supervisor.  
\- For repeated breaches: notify Branch Head/Competent Authority.  
Open Question: define escalation hierarchy and actions (auto-reassignment vs notification only).

## **17.4 Rework & Rejection Rules**

Query and rework cycles are not explicitly listed in the input. Recommended rules (to be confirmed):  
\- Any processing role can raise a query for missing/unclear documents or data inconsistencies.  
\- Applicant is given a configurable time window to respond (e.g., 15 days) after which application may be rejected/closed.  
\- Maximum number of query cycles: configurable.  
\- Rejection must include a reason code and free-text remarks.

# **18\. Test Scenarios**

| TC ID | Scenario | Preconditions | Steps (High-level) | Expected Result | Type |
| :---- | :---- | :---- | :---- | :---- | :---- |
| TC-01 | Happy path \- application approved within SLS | Citizen logged in; valid property identifiers available; all mandatory documents available. | Submit application with all mandatory fields and documents; each stage forwards; final authority approves. | Application is approved; Re-allotment Letter output is generated and downloadable; SLA shows within 10 days. | Happy Path |
| TC-02 | Submission blocked when mandatory field missing | Citizen on application form. | Leave mandatory property identifier (UPN) blank and attempt to submit. | System blocks submission and highlights mandatory field. | Validation |
| TC-03 | Submission blocked when mandatory document missing | Citizen on document upload step. | Do not upload a mandatory document and attempt to submit. | System blocks submission and shows missing document message. | Validation |
| TC-04 | Invalid document format/size rejected | Citizen on upload step. | Upload a file with unsupported format or oversized file. | System rejects file and shows allowed formats/size limits. | Validation |
| TC-05 | Query and rework loop | Application submitted and pending at first internal stage. | Officer raises query; citizen receives notification; citizen resubmits with corrected data/document. | Application returns to the same stage; processing resumes; action history shows query and resubmission. | Rework |
| TC-06 | Manual transfer permission requires physical original status capture | Applicant uploads manual permission scan. | Clerk marks 'Original received' as pending; applicant submits original; clerk updates status. | System prevents final approval until original received status is updated (if enforced). | Physical Verification |
| TC-07 | Rejection by final authority with reason | Application reaches final approving role. | Final officer rejects with reason/remarks. | Application is rejected; rejection order generated; citizen notified and can download rejection order. | Rejection |
| TC-08 | SLA breach escalation | Application pending at a stage beyond configured stage SLS. | Do not process within SLS; system runs breach detection. | Breach is flagged; escalation notification sent to supervisor; appears in SLA breach report. | SLA |
| TC-09 | Payment failure handling (if fee configured) | Fee configured for service (assumption). | Citizen attempts payment; payment fails or times out. | Application remains in 'Payment Pending/Failed'; not routed to clerk; citizen can retry payment. | Payment |
| TC-10 | Property master integration failure | Property master API is down (assumption). | Citizen enters UPN and attempts to validate/fetch details. | System shows error and allows retry; submission is prevented if validation is mandatory. | Integration |
| TC-11 | Unauthorised internal user cannot process stage | Application pending at a role stage. | A user without that role attempts to approve/reject. | System blocks action; access attempt is logged. | Security |
| TC-12 | Audit trail completeness | Application processed end-to-end. | Review audit log entries for submission, uploads, views, queries, decisions. | All key events captured with user, timestamp, action, and application reference. | Audit |

# **19\. Traceability Matrix, Risks, Dependencies, Assumptions & Open Questions**

## **19.1 Traceability Matrix**

| Workflow Step | Step Name | Mapped Requirements (FR/BR/DR/IR/NFR/REP) | Mapped Test Cases |
| :---- | :---- | :---- | :---- |
| 1 | Applicant \- Fill application form, upload documents, and submit application | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, DR-01, DR-02, DR-03, DR-04, DR-05, IR-01, IR-02, IR-03, IR-04, NFR-01, NFR-02, NFR-03 | TC-01, TC-02, TC-03, TC-04 |
| 2 | System \- Validate mandatory fields and required document presence; create workflow task for Clerk; send acknowledgement | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-12, FR-15, FR-16, FR-17, FR-18, BR-01, BR-02, BR-07, DR-06, DR-07, NFR-01, NFR-03 | TC-01, TC-05, TC-08 |
| 3 | Clerk \- Initial scrutiny; verify property and applicant details; ensure transfer permission is attached; forward/raise query/reject (assumed) | FR-08, FR-09, BR-01, BR-02, BR-07, DR-06, DR-07, NFR-01, NFR-03, NFR-08 | TC-01, TC-05, TC-08 |
| 4 | Applicant \- Provide clarifications/corrections; re-upload document(s) if required; resubmit | FR-02, FR-09, FR-10, FR-11, BR-01, BR-02, BR-07, DR-06, DR-07, NFR-01, NFR-03, NFR-08 | TC-01, TC-05, TC-08 |
| 5 | Senior Assistant \- Secondary scrutiny; verify transfer permission and transferee details; forward to AEO or raise query/reject (assumed) | FR-08, FR-10, BR-01, BR-02, BR-07, DR-06, DR-07, NFR-01, NFR-03, NFR-08 | TC-01, TC-05, TC-08 |
| 6 | Assistant Estate Officer (AEO) \- Final review and disposal; approve/reject; ensure original manual document (if any) is submitted as required | FR-08, FR-11, BR-01, BR-02, BR-07, DR-06, DR-07, NFR-01, NFR-03, NFR-08, FR-13, FR-14, FR-15, FR-16, BR-10, BR-11 | TC-01, TC-07, TC-12 |
| 7 | System \- Generate Re-allotment Letter output on approval and/or rejection order; close application; notify applicant | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-12, FR-15, FR-16, FR-17, FR-18, BR-01, BR-02, BR-07, DR-06, DR-07, NFR-01, NFR-03 | TC-01, TC-05, TC-08 |
| 8 | Applicant \- Download output and view final status | FR-07, FR-13, REP-01, REP-02, REP-03, REP-04, REP-05, REP-06, REP-07 | TC-01 |

## **19.2 Dependencies**

| Dependency | Description | Impact if Not Available |
| :---- | :---- | :---- |
| DEP-01 | Citizen & internal authentication/SSO system | Without SSO, login and role assignment cannot work. |
| DEP-02 | Property master (UPN) database and APIs | Without property lookup, manual entry increases errors and processing time. |
| DEP-03 | Document storage/DMS | Without DMS, uploads and evidence retention are not possible. |
| DEP-04 | SMS/Email gateway | Without messaging, notifications and escalations will not be delivered. |
| DEP-05 | Workflow/SLA engine configuration | Without workflow engine, role-based routing and SLA tracking cannot be enforced. |

## **19.3 Risks**

| Risk | Description | Likelihood | Mitigation |
| :---- | :---- | :---- | :---- |
| R-01 | Incomplete or unclear policy rules not present in published service details. | Medium | Maintain assumptions/open questions list; confirm with business; make rules configurable. |
| R-02 | Property master/UPN data quality issues may cause mismatches and delays. | High | Implement validation, error handling, and manual override with audit. |
| R-03 | Physical verification/site inspection dependency may extend timelines beyond system SLA. | Medium | Make inspection/verification steps explicit and trackable; provide scheduling and evidence upload. |
| R-04 | Document fraud/tampering risk due to scanned uploads. | Medium | Use checksums, watermark outputs, and mandatory physical verification where required. |
| R-05 | Notification delivery failures may impact citizen experience. | Low | Implement retries, fallbacks, and in-app inbox. |
| R-06 | SLA breach without escalation visibility may impact compliance. | Medium | Implement escalation rules and supervisor dashboards. |

## **19.4 Assumptions**

* Query/rework loop (raise query, resubmission) is supported though not explicitly listed on the service page; treated as recommended workflow control.  
* Output includes an approval/rejection order and downloadable Re-allotment Letter output where applicable; exact format and signing requirements to be confirmed.  
* Citizen is authenticated and profile provides contact details; only full name is explicitly shown in the form.  
* Assisted channel (Sewa Kendra) may be needed; not explicitly stated for this service.  
* All SLA values are configurable even if published on portal to support policy changes and exceptions.

## **19.5 Open Questions for Business Confirmation**

1. Eligibility: Who can apply \- current owner, allottee, transferee, both, or authorised GPA/SPA holders?  
2. Fee/Payment: Is there any processing fee for this service? If yes, fee head, amount, exemptions, and payment timing.  
3. Property identification: Is UPN mandatory? Which fields are manually entered vs auto-fetched from property master?  
4. Physical verification: What does 'physical verification required' mean (site visit vs in-office original verification)? Who performs it and within what timeline?  
5. Document originals: Is physical submission of original/certified documents required at the authority office? How is receipt acknowledged in the portal?  
6. Rework policy: What is the allowed time window for applicant to respond to a query? How many query cycles are allowed?  
7. SLA policy during query: Should SLA pause, reset, or continue while waiting for applicant response?  
8. Final output: Should the output be digitally signed and include QR code for verification?  
9. Retention: What is the record retention period for applications, documents, and audit logs?  
10. Manual document handling: For manual transfer permission, how is original submission tracked and acknowledged? Is it mandatory before disposal?

## **19.6 References**

1\. PUDA portal \- Service Details: 'Issue of Re-allotment Letter' (Service ID 32). Source document captured as PDF from puda.gov.in (accessed 02 Feb 2026).

Note: Items marked as 'Recommendation' are provided as industry best practices. No verifiable external source was used; treat as recommendation and confirm with PUDA.