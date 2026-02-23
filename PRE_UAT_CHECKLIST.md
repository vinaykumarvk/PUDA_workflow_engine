# Pre-UAT Checklist - UAT-1 Delivery

**Date:** 2026-02-04  
**Status:** Pre-UAT Preparation  
**Target:** Week 8 UAT-1 Sign-off

---

## ✅ Completed Items

### Development
- [x] All BRD features implemented (20/20 requirements)
- [x] Database migrations completed
- [x] Search functionality implemented
- [x] Save Draft button added
- [x] Export functionality implemented
- [x] Assisted submission support added
- [x] Verification checklist UI added
- [x] Configuration-driven architecture verified

### Documentation
- [x] BRD Feature Verification document (`BRD_FEATURE_VERIFICATION_UAT1.md`)
- [x] Implementation Complete document (`IMPLEMENTATION_COMPLETE_UAT1.md`)
- [x] Configuration Verification document (`CONFIGURATION_VERIFICATION.md`)

---

## 🔲 Pre-UAT Tasks (Must Complete)

### 1. Database & Environment Setup

#### 1.1 Database Migration
- [x] **DONE:** Migration `002_complete_schema.sql` executed
- [ ] Verify all columns exist: `submission_channel`, `assisted_by_user_id`
- [ ] Verify indexes are created

#### 1.2 Seed Data
- [ ] **Run seed script** to populate test data:
  ```bash
  cd apps/api
  npm run seed
  ```
- [ ] Verify seed data includes:
  - [ ] 5 citizen users (citizen1-citizen5)
  - [ ] Officer users with proper role assignments
  - [ ] Service versions published for all 4 UAT-1 services
  - [ ] Sample applications in various states
  - [ ] Documents uploaded for applications
  - [ ] Tasks created for pending applications
  - [ ] Queries raised for some applications

#### 1.3 Environment Configuration
- [ ] Verify `.env` file exists or environment variables set:
  - [ ] `DATABASE_URL` or default connection works
  - [ ] API base URL configured for frontend
- [ ] Verify PostgreSQL is running and accessible
- [ ] Verify ports are available (API: 3001, Citizen: 3000, Officer: 3002)

---

### 2. Service Pack Validation

#### 2.1 Service Pack Files
- [ ] Verify all 4 UAT-1 service packs exist:
  - [ ] `service-packs/registration_of_architect/`
  - [ ] `service-packs/no_due_certificate/`
  - [ ] `service-packs/sanction_of_water_supply/`
  - [ ] `service-packs/sanction_of_sewerage_connection/`

#### 2.2 Configuration Files Validation
For each service pack, verify:
- [ ] `service.yaml` - Service metadata correct
- [ ] `form.json` - All BRD fields present, labels match BRD
- [ ] `workflow.json` - States match BRD state model, transitions correct
- [ ] `documents.json` - Document names match BRD exactly
- [ ] `templates/*.html` - Output templates exist (approval/rejection)

#### 2.3 Service Version Publishing
- [ ] Verify service versions are published in database:
  ```sql
  SELECT service_key, version, status FROM service_version 
  WHERE service_key IN ('registration_of_architect', 'no_due_certificate', 
                         'sanction_of_water_supply', 'sanction_of_sewerage_connection')
    AND status = 'published';
  ```
- [ ] All 4 services should show `status = 'published'`

---

### 3. Application Build & Deployment

#### 3.1 Backend API
- [ ] Build API:
  ```bash
  cd apps/api
  npm install
  npm run build
  ```
- [ ] Start API server:
  ```bash
  npm start
  # OR for development
  npm run dev
  ```
- [ ] Verify API health:
  - [ ] `GET http://localhost:3001/api/v1/config/services` returns service list
  - [ ] `GET http://localhost:3001/api/v1/config/services/registration_of_architect` returns config

#### 3.2 Citizen Portal
- [ ] Build citizen app:
  ```bash
  cd apps/citizen
  npm install
  npm run build
  ```
- [ ] Start citizen portal:
  ```bash
  npm run dev
  ```
- [ ] Verify citizen portal loads:
  - [ ] Login screen appears
  - [ ] Can login with test credentials (citizen1 / password123)
  - [ ] Dashboard displays applications
  - [ ] Service catalog shows 4 UAT-1 services

#### 3.3 Officer Workbench
- [ ] Build officer app:
  ```bash
  cd apps/officer
  npm install
  npm run build
  ```
- [ ] Start officer workbench:
  ```bash
  npm run dev
  ```
- [ ] Verify officer workbench loads:
  - [ ] Inbox displays tasks
  - [ ] Can search applications
  - [ ] Can review and take actions

---

### 4. End-to-End Testing

#### 4.1 Citizen Flow - New Application
- [ ] **Registration of Architect:**
  - [ ] Login as citizen1
  - [ ] Select "Registration of Architect" service
  - [ ] Fill form with all required fields
  - [ ] Upload required documents (5 documents)
  - [ ] Click "Save Draft" - verify draft saved
  - [ ] Resume draft - verify data persists
  - [ ] Submit application - verify ARN generated
  - [ ] Verify application appears in dashboard

- [ ] **No Due Certificate:**
  - [ ] Create new application
  - [ ] Fill property details
  - [ ] Upload payment receipt (if payment details not updated)
  - [ ] Submit and verify ARN

- [ ] **Water Supply:**
  - [ ] Create application
  - [ ] Fill all form fields
  - [ ] Upload 7 required documents
  - [ ] Submit and verify

- [ ] **Sewerage Connection:**
  - [ ] Create application
  - [ ] Fill form fields
  - [ ] Upload 4 required documents
  - [ ] Submit and verify

#### 4.2 Officer Flow - Processing
- [ ] **Task Assignment:**
  - [ ] Login as officer (test-officer-1)
  - [ ] Verify inbox shows pending tasks
  - [ ] Click task to assign to self
  - [ ] Verify application details load

- [ ] **Review & Actions:**
  - [ ] View application data
  - [ ] View uploaded documents
  - [ ] For water/sewerage: Complete verification checklist
  - [ ] Add remarks
  - [ ] Test actions:
    - [ ] Forward to next stage
    - [ ] Raise Query (with unlocked fields/documents)
    - [ ] Approve application
    - [ ] Reject application

- [ ] **Query Response:**
  - [ ] As citizen, view query
  - [ ] Respond to query
  - [ ] Update unlocked fields
  - [ ] Upload additional documents
  - [ ] Resubmit application
  - [ ] Verify application returns to officer

- [ ] **Output Generation:**
  - [ ] Approve an application
  - [ ] Verify output (certificate/order) generated
  - [ ] Download output as citizen
  - [ ] Download output as officer
  - [ ] Verify output contains correct data

#### 4.3 Search & Export
- [ ] **Search Functionality:**
  - [ ] Search by ARN
  - [ ] Search by applicant name
  - [ ] Search by UPN
  - [ ] Search by plot number
  - [ ] Filter by status
  - [ ] Verify results are clickable

- [ ] **Export Functionality:**
  - [ ] Perform search
  - [ ] Click "Export CSV"
  - [ ] Verify CSV downloads
  - [ ] Verify CSV contains correct columns
  - [ ] Verify CSV data matches search results

#### 4.4 Assisted Submission
- [ ] Create application with `submissionChannel: "ASSISTED_SEWA_KENDRA"`
- [ ] Verify `submission_channel` stored in database
- [ ] Verify audit log captures channel
- [ ] Verify application flows normally

---

### 5. Test Data Verification

#### 5.1 Citizen Test Accounts
- [ ] Verify 5 citizen accounts exist:
  - [ ] citizen1 / password123
  - [ ] citizen2 / password123
  - [ ] citizen3 / password123
  - [ ] citizen4 / password123
  - [ ] citizen5 / password123

#### 5.2 Officer Test Accounts
- [ ] Verify officer accounts exist with proper role assignments:
  - [ ] CLERK role
  - [ ] SENIOR_ASSISTANT role
  - [ ] ACCOUNT_OFFICER role
  - [ ] JUNIOR_ENGINEER role (for water/sewerage)
  - [ ] SDO role (for water/sewerage)

#### 5.3 Application States
- [ ] Verify applications exist in various states:
  - [ ] DRAFT (for testing save/resume)
  - [ ] PENDING_AT_CLERK
  - [ ] QUERY_PENDING (for testing query response)
  - [ ] APPROVED (for testing output download)
  - [ ] REJECTED (for testing rejection output)

---

### 6. Documentation for UAT Team

#### 6.1 UAT Test Cases Document
- [ ] Create `UAT_TEST_CASES_UAT1.md` with:
  - [ ] Test scenarios mapped to BRD requirements
  - [ ] Step-by-step test procedures
  - [ ] Expected results for each test
  - [ ] Test data requirements
  - [ ] Known limitations

#### 6.2 User Guide
- [ ] Create `USER_GUIDE_UAT1.md` with:
  - [ ] Citizen portal user guide
  - [ ] Officer workbench user guide
  - [ ] Screenshots of key screens
  - [ ] Common workflows explained

#### 6.3 Known Limitations Document
- [ ] Create `KNOWN_LIMITATIONS_UAT1.md` documenting:
  - [ ] Payment integration not included (UAT-2)
  - [ ] Physical inspection module not included (UAT-4)
  - [ ] SMS/Email notifications are stubbed (console logs only)
  - [ ] Outputs are unsigned HTML (not PDF with digital signature)
  - [ ] Property master integration is stubbed
  - [ ] Ledger integration is stubbed

#### 6.4 Setup Instructions
- [ ] Update `README.md` or create `SETUP_UAT.md` with:
  - [ ] Prerequisites (Node.js, PostgreSQL versions)
  - [ ] Database setup steps
  - [ ] Environment variable configuration
  - [ ] Installation commands
  - [ ] Seed data instructions
  - [ ] Starting services instructions
  - [ ] Access URLs

---

### 7. Code Quality & Testing

#### 7.1 Unit Tests
- [ ] Run unit tests:
  ```bash
  cd apps/api
  npm test
  ```
- [ ] Verify all tests pass
- [ ] Fix any failing tests

#### 7.2 Integration Tests
- [ ] Run integration tests
- [ ] Verify API endpoints work correctly
- [ ] Verify workflow transitions work
- [ ] Verify document upload works

#### 7.3 Manual Smoke Testing
- [ ] Test all 4 services end-to-end
- [ ] Test happy path for each service
- [ ] Test error scenarios (missing fields, invalid data)
- [ ] Test query/resubmission flow
- [ ] Test output generation

---

### 8. Performance & Security

#### 8.1 Performance
- [ ] Verify form loads within acceptable time (< 2 seconds)
- [ ] Verify search results return quickly (< 1 second)
- [ ] Verify document upload works for files up to 10MB
- [ ] Verify dashboard loads with 50+ applications

#### 8.2 Security
- [ ] Verify password hashing works
- [ ] Verify authentication required for all endpoints
- [ ] Verify role-based access control works
- [ ] Verify SQL injection protection (parameterized queries)
- [ ] Verify file upload restrictions (file types, sizes)

---

### 9. UAT Environment Preparation

#### 9.1 UAT Environment Setup
- [ ] Set up UAT database (separate from dev)
- [ ] Run migrations on UAT database
- [ ] Seed UAT database with test data
- [ ] Deploy API to UAT server
- [ ] Deploy Citizen portal to UAT server
- [ ] Deploy Officer workbench to UAT server

#### 9.2 UAT Access
- [ ] Create UAT user accounts for testers
- [ ] Provide login credentials securely
- [ ] Provide access URLs
- [ ] Provide test data reference

#### 9.3 Monitoring & Logging
- [ ] Set up error logging
- [ ] Set up application monitoring
- [ ] Verify logs are accessible
- [ ] Set up alerts for critical errors

---

### 10. Final Verification

#### 10.1 BRD Traceability
- [ ] Verify all BRD requirements are implemented
- [ ] Document any deviations with justification
- [ ] Update BRD verification document

#### 10.2 Configuration Verification
- [ ] Verify all service configurations are correct
- [ ] Verify workflow states match BRDs
- [ ] Verify form fields match BRDs
- [ ] Verify document lists match BRDs

#### 10.3 Deliverables Checklist
- [ ] Citizen portal functional ✅
- [ ] Officer workbench functional ✅
- [ ] Output generation working ✅
- [ ] BRD traceability document ✅
- [ ] UAT test cases document ⚠️
- [ ] User guide ⚠️
- [ ] Known limitations document ⚠️
- [ ] Setup instructions ⚠️

---

## 🚨 Critical Path Items (Must Complete Before UAT)

1. **Seed Data** - Must run seed script to populate test data
2. **Service Pack Validation** - Verify all 4 services are published
3. **End-to-End Testing** - Test at least one complete flow per service
4. **UAT Test Cases** - Create test cases document for UAT team
5. **Known Limitations** - Document what's not included in UAT-1
6. **Setup Instructions** - Provide clear instructions for UAT environment

---

## 📋 Recommended Order of Execution

1. **Day 1: Environment & Data**
   - Run seed script
   - Verify service packs published
   - Verify test accounts exist

2. **Day 2: End-to-End Testing**
   - Test all 4 services complete flows
   - Test query/resubmission
   - Test output generation
   - Fix any critical bugs

3. **Day 3: Documentation**
   - Create UAT test cases
   - Create user guide
   - Document known limitations
   - Update setup instructions

4. **Day 4: Final Verification**
   - Run all tests
   - Verify all checkboxes above
   - Prepare UAT environment
   - Handover to UAT team

---

## ✅ Sign-off Criteria

Before declaring UAT-ready, ensure:

- [ ] All 4 UAT-1 services are functional end-to-end
- [ ] Test data is populated and accessible
- [ ] Documentation is complete
- [ ] Known limitations are documented
- [ ] UAT environment is ready
- [ ] UAT test cases are prepared
- [ ] Critical bugs are fixed
- [ ] Performance is acceptable

---

## 📝 Notes

- **Timeline:** Target Week 8 for UAT-1 sign-off
- **Scope:** Only UAT-1 services (4 services)
- **Out of Scope:** Payments, inspections, complex property workflows
- **Acceptable:** Unsigned outputs, stubbed notifications, manual verification

---

**Next Action:** Run seed script and verify test data is populated.
