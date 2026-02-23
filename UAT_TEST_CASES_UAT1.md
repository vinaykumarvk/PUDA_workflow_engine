# UAT Test Cases - UAT-1 Services

**Date:** 2026-02-04  
**Version:** 1.0  
**Scope:** All 4 UAT-1 Services

---

## Test Environment Setup

### Prerequisites
- PostgreSQL database running
- Migrations applied
- Seed data populated (`npm --workspace apps/api run seed`)
- API server running (`npm --workspace apps/api run dev`)
- Citizen portal running (`npm --workspace apps/citizen run dev`)
- Officer workbench running (`npm --workspace apps/officer run dev`)

### Test Accounts
- **Citizens:** citizen1, citizen2, citizen3, citizen4, citizen5 (password: password123)
- **Officer:** officer1 (password: password123) - Has CLERK, SENIOR_ASSISTANT, ACCOUNT_OFFICER roles

---

## Test Case Structure

Each test case includes:
- **Test ID:** Unique identifier
- **BRD Reference:** Functional Requirement from BRD
- **Priority:** Must / Should / Could
- **Preconditions:** What must exist before test
- **Test Steps:** Step-by-step instructions
- **Expected Result:** What should happen
- **Actual Result:** (To be filled during testing)
- **Status:** Pass / Fail / Blocked

---

## Service 1: Registration of Architect

### TC-ARCH-001: Service Initiation
**BRD Reference:** FR-01  
**Priority:** Must

**Preconditions:**
- User logged in as citizen
- Service pack published

**Test Steps:**
1. Navigate to service catalog
2. Click on "Registration of Architect" service
3. Verify service details page loads
4. Verify authority selection is available

**Expected Result:**
- Service details page displays
- Authority dropdown shows PUDA/GMADA/GLADA/BDA
- Service requirements and SLA displayed

**Automated Test:** ✅ PASS

---

### TC-ARCH-002: Form Fields Validation
**BRD Reference:** FR-02  
**Priority:** Must

**Preconditions:**
- Service selected
- Form page loaded

**Test Steps:**
1. Verify all required fields are present:
   - Authority selection
   - Applicant: Salutation, Full Name, Father's Name, Gender, Marital Status, DOB, Aadhaar, Email, Mobile
   - CoA: Certificate Number, Valid From, Valid Till
   - Address: Permanent and Official addresses
2. Fill all required fields with valid data
3. Attempt to submit without filling mandatory fields

**Expected Result:**
- All fields from BRD are present
- Form validation prevents submission with missing mandatory fields

**Automated Test:** ✅ PASS

---

### TC-ARCH-003: Save Draft Functionality
**BRD Reference:** FR-03  
**Priority:** Must

**Preconditions:**
- Form partially filled

**Test Steps:**
1. Fill some form fields (not all)
2. Click "Save Draft" button
3. Navigate away from form
4. Return to dashboard
5. Click on draft application
6. Verify data persists

**Expected Result:**
- Draft saved successfully
- Application appears in dashboard with "DRAFT" status
- Data persists when resumed

**Automated Test:** ✅ PASS

---

### TC-ARCH-004: Document Upload with Versioning
**BRD Reference:** FR-04  
**Priority:** Must

**Preconditions:**
- Application in DRAFT state
- Required documents: DOC_COA_CERT, DOC_ARCH_DEGREE, DOC_ADDRESS_PROOF, DOC_AADHAAR, DOC_PAN

**Test Steps:**
1. Navigate to application detail
2. Upload DOC_COA_CERT document
3. Verify document appears in list
4. Upload same document type again (new version)
5. Verify version increments
6. Verify previous version marked as not current

**Expected Result:**
- Document uploads successfully
- Version increments on re-upload
- Only current version shown in UI
- Previous versions accessible via API

**Automated Test:** ✅ PASS

---

### TC-ARCH-005: Mandatory Validation
**BRD Reference:** FR-05  
**Priority:** Must

**Preconditions:**
- Application in DRAFT state

**Test Steps:**
1. Attempt to submit without filling mandatory fields
2. Attempt to submit without uploading mandatory documents
3. Fill all mandatory fields and upload all mandatory documents
4. Submit application

**Expected Result:**
- Submission blocked if mandatory fields missing
- Submission blocked if mandatory documents missing
- Submission succeeds when all requirements met

**Automated Test:** ⚠️ Manual testing required

---

### TC-ARCH-006: ARN Generation
**BRD Reference:** FR-06  
**Priority:** Must

**Preconditions:**
- Application ready for submission

**Test Steps:**
1. Fill all required fields
2. Upload all mandatory documents
3. Click "Submit Application"
4. Verify ARN is generated
5. Verify ARN format: `{AUTHORITY}/{YEAR}/{TIMESTAMP}`
6. Verify acknowledgement message displayed

**Expected Result:**
- ARN generated and displayed
- ARN format correct
- Application status changes to SUBMITTED
- Acknowledgement shown to user

**Automated Test:** ✅ PASS

---

### TC-ARCH-007: Applicant Dashboard
**BRD Reference:** FR-07  
**Priority:** Must

**Preconditions:**
- User logged in as citizen
- At least one application exists

**Test Steps:**
1. Login as citizen
2. Verify dashboard displays:
   - Total applications count
   - Active applications count
   - Pending action count
   - Approved count
3. Verify "Requires Attention" section shows queries
4. Click on application card
5. Verify application detail page shows:
   - Current status
   - Timeline/history
   - Documents list
   - Queries (if any)
   - Output download (if disposed)

**Expected Result:**
- Dashboard displays all statistics
- Application cards clickable
- Detail page shows all information
- Status updates reflect current state

**Automated Test:** ⚠️ Manual testing required

---

### TC-ARCH-008: Workflow Routing
**BRD Reference:** FR-08  
**Priority:** Must

**Preconditions:**
- Application submitted
- Officer logged in

**Test Steps:**
1. Submit application as citizen
2. Login as officer (CLERK role)
3. Verify application appears in inbox
4. Verify task shows correct state (PENDING_AT_CLERK)
5. Verify SLA due date displayed

**Expected Result:**
- Application appears in officer inbox
- Task assigned to CLERK role
- State matches workflow configuration
- SLA due date calculated correctly

**Automated Test:** ✅ PASS

---

### TC-ARCH-009: Officer Actions
**BRD Reference:** FR-09  
**Priority:** Must

**Preconditions:**
- Application in officer inbox
- Officer logged in

**Test Steps:**
1. Click on application in inbox
2. Verify application details load
3. Verify documents are viewable
4. Add remarks in remarks field
5. Test Forward action:
   - Click "Forward"
   - Add remarks
   - Submit
   - Verify application moves to next stage
6. Test Query action:
   - Click "Raise Query"
   - Enter query message
   - Select fields/documents to unlock
   - Submit
   - Verify query created
   - Verify application returns to citizen
7. Test Approve action:
   - Click "Approve"
   - Add remarks
   - Submit
   - Verify application approved
   - Verify output generated
8. Test Reject action:
   - Click "Reject"
   - Add remarks
   - Submit
   - Verify application rejected
   - Verify rejection order generated

**Expected Result:**
- All actions work correctly
- Remarks stored
- State transitions correct
- Outputs generated on approve/reject

**Automated Test:** ⚠️ Partial (Forward tested)

---

### TC-ARCH-010: Query and Rework Loop
**BRD Reference:** FR-10  
**Priority:** Must

**Preconditions:**
- Application submitted
- Query raised by officer

**Test Steps:**
1. As citizen, view application with query
2. Verify query message displayed
3. Verify unlocked fields are editable
4. Verify unlocked document types can be uploaded
5. Edit unlocked fields
6. Upload additional documents
7. Respond to query with message
8. Resubmit application
9. Verify application returns to originating officer
10. Verify workflow resumes from correct stage

**Expected Result:**
- Query visible to citizen
- Unlocked fields editable
- Response can be submitted
- Application returns to correct stage
- Workflow continues correctly

**Automated Test:** ⚠️ Manual testing required

---

### TC-ARCH-011: CoA Certificate Validity Check
**BRD Reference:** FR-11  
**Priority:** Should

**Preconditions:**
- Application with CoA certificate details

**Test Steps:**
1. Verify form captures:
   - CoA Certificate Number
   - Valid From date
   - Valid Till date
2. As officer, verify certificate validity before approval
3. Verify remarks can be added about validity check

**Expected Result:**
- Validity dates captured
- Officer can verify manually
- Remarks can be recorded

**Automated Test:** ✅ PASS (Fields present)

---

### TC-ARCH-012: Output Generation
**BRD Reference:** FR-14  
**Priority:** Must

**Preconditions:**
- Application approved or rejected

**Test Steps:**
1. Approve application as officer
2. Verify output generated
3. As citizen, verify download link appears
4. Download certificate/order
5. Verify output contains:
   - ARN
   - Applicant name
   - Issue date
   - Authority name
6. As officer, verify download link available

**Expected Result:**
- Output generated on approval/rejection
- Download links available to citizen and officer
- Output contains correct data

**Automated Test:** ✅ PASS

---

### TC-ARCH-013: Search Functionality
**BRD Reference:** FR-16  
**Priority:** Must

**Preconditions:**
- Officer logged in
- Multiple applications exist

**Test Steps:**
1. Click "Search" button in officer UI
2. Search by ARN:
   - Enter known ARN
   - Verify results show matching application
3. Search by applicant name:
   - Enter applicant name
   - Verify results show matching applications
4. Search by status:
   - Select status filter
   - Verify results filtered correctly
5. Click on search result
6. Verify application details load

**Expected Result:**
- Search works for ARN, name, UPN, plot, scheme
- Results accurate
- Results clickable
- Status filter works

**Automated Test:** ✅ PASS

---

### TC-ARCH-014: Export Functionality
**BRD Reference:** FR-18  
**Priority:** Could

**Preconditions:**
- Search results displayed

**Test Steps:**
1. Perform search
2. Click "Export CSV" button
3. Verify CSV file downloads
4. Open CSV file
5. Verify columns present:
   - ARN
   - Service Key
   - Authority ID
   - Applicant Name
   - UPN
   - Plot No
   - Scheme Name
   - Status
   - Created At
   - Submitted At
   - Disposed At
   - Disposal Type
6. Verify data matches search results

**Expected Result:**
- CSV downloads successfully
- All columns present
- Data accurate
- File opens correctly

**Automated Test:** ✅ PASS

---

## Service 2: No Due Certificate

### TC-NDC-001: Service Initiation
**BRD Reference:** FR-01  
**Priority:** Must

**Test Steps:**
1. Navigate to service catalog
2. Click on "No Due Certificate" service
3. Verify service details page loads

**Expected Result:**
- Service details page displays
- Authority selection available

**Automated Test:** ✅ PASS

---

### TC-NDC-002: Form Fields (Applicant + Property)
**BRD Reference:** FR-02  
**Priority:** Must

**Test Steps:**
1. Verify form contains:
   - Authority selection
   - Applicant: Full Name, Remark
   - Property: UPN, Area (sq.yd), Authority Name, Plot No, Type, Scheme Name
   - Payment details updated flag
2. Fill all fields
3. Verify form validation

**Expected Result:**
- All BRD fields present
- Validation works

**Automated Test:** ✅ PASS

---

### TC-NDC-003: Document Upload
**BRD Reference:** FR-03  
**Priority:** Must

**Test Steps:**
1. Create draft application
2. Upload DOC_PAYMENT_RECEIPT document
3. Verify upload succeeds
4. Verify document appears in list

**Expected Result:**
- Document uploads successfully
- Document visible in application detail

**Automated Test:** ✅ PASS

---

### TC-NDC-004: Conditional Document Rule
**BRD Reference:** FR-03 (Payment Receipt)  
**Priority:** Must

**Test Steps:**
1. Create application with `payment_details_updated: true`
2. Verify payment receipt not required
3. Create application with `payment_details_updated: false`
4. Verify payment receipt required

**Expected Result:**
- Document requirement conditional on payment flag
- Validation enforces rule correctly

**Automated Test:** ⚠️ Manual testing required

---

### TC-NDC-005: ARN Generation
**BRD Reference:** FR-05  
**Priority:** Must

**Test Steps:**
1. Fill form completely
2. Upload required documents
3. Submit application
4. Verify ARN generated

**Expected Result:**
- ARN generated with correct format
- Acknowledgement displayed

**Automated Test:** ✅ PASS

---

### TC-NDC-006: Workflow Stages
**BRD Reference:** FR-07, FR-08, FR-09, FR-10  
**Priority:** Must

**Test Steps:**
1. Submit application
2. Verify task created for CLERK
3. CLERK forwards to SR_ASSISTANT_ACCOUNTS
4. SR_ASSISTANT forwards to ACCOUNT_OFFICER
5. ACCOUNT_OFFICER approves/rejects
6. Verify output generated

**Expected Result:**
- Applications route through correct stages
- Each role can take actions
- Output generated on disposal

**Automated Test:** ⚠️ Manual testing required

---

### TC-NDC-007: Search by UPN/Plot/Scheme
**BRD Reference:** FR-16  
**Priority:** Should

**Test Steps:**
1. Create application with UPN "UPN-TEST-123"
2. Search by "UPN-TEST-123"
3. Verify application found
4. Search by plot number
5. Search by scheme name

**Expected Result:**
- Search finds applications by UPN
- Search finds by plot number
- Search finds by scheme name

**Automated Test:** ✅ PASS

---

## Service 3: Sanction of Water Supply

### TC-WATER-001: Service Initiation
**BRD Reference:** FR-01  
**Priority:** Must

**Test Steps:**
1. Navigate to service catalog
2. Click on "Sanction of Water Supply" service
3. Verify service details page loads

**Expected Result:**
- Service details page displays

**Automated Test:** ✅ PASS

---

### TC-WATER-002: Multiple Document Uploads
**BRD Reference:** FR-04  
**Priority:** Must

**Preconditions:**
- Application in DRAFT state

**Test Steps:**
1. Upload all 7 required documents:
   - DOC_BUILDING_PLAN
   - DOC_GPA (optional)
   - DOC_PLUMBER_CERT
   - DOC_ARCH_ESTIMATE
   - DOC_UNDERTAKING
   - DOC_OWNER_PHOTOS
   - DOC_OWNER_PHOTO_IDS
2. Verify all documents upload successfully
3. Verify all appear in document list

**Expected Result:**
- All documents upload successfully
- All documents visible in list
- Versioning works for each type

**Automated Test:** ✅ PASS

---

### TC-WATER-003: Verification Checklist
**BRD Reference:** FR-11  
**Priority:** Should

**Preconditions:**
- Application in officer review
- Officer logged in

**Test Steps:**
1. Open application in officer UI
2. Verify verification checklist section appears
3. Verify checklist items:
   - Property location verified
   - Documents verified
   - Connection feasible
   - Water source available
4. Check items in checklist
5. Add verification remarks
6. Take action (Forward/Approve)
7. Verify remarks included in action

**Expected Result:**
- Checklist appears for water supply service
- Items can be checked
- Remarks can be added
- Remarks included in action

**Automated Test:** ✅ PASS (UI verified)

---

### TC-WATER-004: Workflow Stages
**BRD Reference:** FR-08  
**Priority:** Must

**Test Steps:**
1. Submit application
2. Verify routes to CLERK
3. CLERK forwards to JUNIOR_ENGINEER
4. JUNIOR_ENGINEER completes verification
5. JUNIOR_ENGINEER forwards to SDO
6. SDO approves/rejects

**Expected Result:**
- Applications route through correct stages
- Verification can be completed
- Approval/rejection works

**Automated Test:** ⚠️ Manual testing required

---

## Service 4: Sanction of Sewerage Connection

### TC-SEWERAGE-001: Service Initiation
**BRD Reference:** FR-01  
**Priority:** Must

**Test Steps:**
1. Navigate to service catalog
2. Click on "Sanction of Sewerage Connection" service
3. Verify service details page loads

**Expected Result:**
- Service details page displays

**Automated Test:** ✅ PASS

---

### TC-SEWERAGE-002: Document Upload
**BRD Reference:** FR-04  
**Priority:** Must

**Test Steps:**
1. Upload all 4 required documents:
   - DOC_OCCUPATION_CERT
   - DOC_WATER_RECEIPT
   - DOC_UNDERTAKING
   - DOC_PLUMBER_CERT
2. Verify all upload successfully

**Expected Result:**
- All documents upload successfully

**Automated Test:** ✅ PASS

---

### TC-SEWERAGE-003: Verification Checklist
**BRD Reference:** FR-11  
**Priority:** Should

**Test Steps:**
1. Open application in officer UI
2. Verify verification checklist appears
3. Verify checklist items:
   - Property location verified
   - Documents verified
   - Connection feasible
   - Sewer line available
4. Complete checklist and take action

**Expected Result:**
- Checklist appears for sewerage service
- Items can be checked
- Remarks can be added

**Automated Test:** ✅ PASS (UI verified)

---

## Common Test Cases (All Services)

### TC-COMMON-001: Assisted Submission
**BRD Reference:** FR-17 (NDC)  
**Priority:** Could

**Test Steps:**
1. Create application with `submissionChannel: "ASSISTED_SEWA_KENDRA"`
2. Verify `submission_channel` stored in database
3. Verify audit log captures channel
4. Verify application flows normally

**Expected Result:**
- Channel marker stored
- Audit log includes channel
- Application processes normally

**Automated Test:** ⚠️ Manual testing required

---

### TC-COMMON-002: Notifications
**BRD Reference:** FR-15  
**Priority:** Must

**Test Steps:**
1. Submit application
2. Verify notification created (check database/console)
3. Raise query
4. Verify notification created
5. Respond to query
6. Verify notification created
7. Approve application
8. Verify notification created

**Expected Result:**
- Notifications created for all events
- Currently stubbed (console logs)

**Automated Test:** ⚠️ Manual verification required

---

### TC-COMMON-003: SLA Tracking
**BRD Reference:** FR-13, FR-14  
**Priority:** Should

**Test Steps:**
1. Submit application
2. Verify SLA due date calculated
3. Verify displayed in officer inbox
4. Wait for SLA to pass (or manually set past date)
5. Verify "(Overdue)" indicator shown

**Expected Result:**
- SLA due dates calculated correctly
- Overdue flag displayed
- SLA paused during query

**Automated Test:** ⚠️ Manual testing required

---

## Test Execution Summary

### Automated Tests
- **Total:** 21 test cases
- **Passed:** 21 ✅
- **Failed:** 0 ❌
- **Pass Rate:** 100%

### Manual Tests Required
- **Total:** ~30 test cases
- **Priority:** High (Must priority items)
- **Focus Areas:**
  - UI workflows
  - End-to-end flows
  - Query/resubmission
  - Output downloads
  - Notifications

---

## Test Execution Instructions

### Running Automated Tests
```bash
cd apps/api
npm test -- brd-test-cases
```

### Manual Testing Checklist
1. [ ] Test all 4 services end-to-end
2. [ ] Verify citizen portal workflows
3. [ ] Verify officer workbench workflows
4. [ ] Test query/resubmission flows
5. [ ] Verify output downloads
6. [ ] Test search functionality in UI
7. [ ] Test export functionality
8. [ ] Verify verification checklists
9. [ ] Test assisted submission
10. [ ] Verify notifications (stubbed)

---

## Known Issues / Limitations

1. **Notifications:** Currently stubbed (console logs only)
2. **Outputs:** Unsigned HTML (not PDF with signature)
3. **Payments:** Not implemented (UAT-2)
4. **Physical Inspection:** Manual checklist only (no mobile app)

---

## Sign-off Criteria

Before UAT sign-off:
- [ ] All automated tests passing ✅
- [ ] All Must-priority manual tests executed
- [ ] Critical bugs fixed
- [ ] Documentation complete
- [ ] Known limitations documented

---

**Test Execution Date:** _______________  
**Executed By:** _______________  
**Sign-off:** _______________
