# PUDA Citizen Portal - Dashboard Design & Brainstorming

## Overview
After login, citizens should land on a personalized dashboard that provides:
- **Quick overview** of their application status
- **Actionable items** requiring attention
- **Easy navigation** to key features
- **Transparency** in application tracking

---

## Dashboard Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Welcome [Name] | Profile | Logout                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  QUICK STATS CARDS (4 cards in a row)                   │ │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   │ │
│  │  │Total │ │Active│ │Pending│ │Approved│                 │ │
│  │  │  12  │ │  3   │ │  2   │ │   7   │                   │ │
│  │  └──────┘ └──────┘ └──────┘ └──────┘                   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  QUICK ACTIONS (Horizontal buttons)                      │ │
│  │  [Apply for New Service] [View All Applications]          │ │
│  │  [Track Application] [Upload Documents]                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  ⚠️  REQUIRES ATTENTION (Alert Section)                 │ │
│  │  ┌───────────────────────────────────────────────────┐   │ │
│  │  │ 🔴 Query Raised - No Due Certificate              │   │ │
│  │  │    ARN: PUDA/2026/NDC/001 | Respond within 7 days│   │ │
│  │  │    [View Details] [Respond to Query]             │   │ │
│  │  └───────────────────────────────────────────────────┘   │ │
│  │  ┌───────────────────────────────────────────────────┐   │ │
│  │  │ 📄 Document Upload Required - Water Supply        │   │ │
│  │  │    ARN: PUDA/2026/WS/045 | Upload property deed   │   │ │
│  │  │    [View Details] [Upload Now]                    │   │ │
│  │  └───────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  📋 RECENT APPLICATIONS (Table/List View)               │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │ Service Name    │ ARN          │ Status    │ Date │  │ │
│  │  ├────────────────────────────────────────────────────┤  │ │
│  │  │ No Due Cert    │ PUDA/.../001 │ Query      │ 2d   │  │ │
│  │  │ Water Supply   │ PUDA/.../045 │ In Review │ 5d   │  │ │
│  │  │ Sewerage       │ PUDA/.../023 │ Approved   │ 10d  │  │ │
│  │  │ Architect Reg  │ PUDA/.../012 │ Draft      │ 1d   │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  │  [View All Applications] [Filter by Status ▼]           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  📢 NOTIFICATIONS & UPDATES (Collapsible)                │ │
│  │  • Application PUDA/2026/WS/045 moved to Senior Asst   │ │
│  │  • Document uploaded successfully for PUDA/2026/NDC/001   │ │
│  │  • Certificate ready for download: PUDA/2026/SE/023    │ │
│  │  [View All Notifications]                                │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Components Breakdown

### 1. **Quick Stats Cards** (Top Row)
**Purpose:** At-a-glance overview of application portfolio

**Cards:**
- **Total Applications** - All time count
- **Active Applications** - Currently in workflow (DRAFT, SUBMITTED, IN_PROGRESS, QUERY_PENDING)
- **Pending Action** - Requiring citizen response (QUERY_PENDING, document uploads)
- **Approved/Completed** - Successfully completed applications

**Design:**
- Large number, small label
- Color-coded (green for approved, yellow for pending, blue for active)
- Clickable → filters application list

---

### 2. **Quick Actions Bar**
**Purpose:** Fast access to common tasks

**Actions:**
- **"Apply for New Service"** → Opens service catalog
- **"View All Applications"** → Full application list page
- **"Track Application"** → Search by ARN
- **"Upload Documents"** → Quick upload (if any pending)

**Design:**
- Prominent buttons, icon + text
- Primary action (Apply) highlighted

---

### 3. **Requires Attention Section** (Alert Panel)
**Purpose:** Highlight items needing immediate action

**Shows:**
- **Queries Raised** - Applications with pending queries
  - ARN, service name, query details preview
  - Days remaining to respond
  - Quick action: "Respond to Query"
  
- **Document Upload Required** - Missing/requested documents
  - ARN, service name, document type needed
  - Quick action: "Upload Now"

- **Payment Pending** (Future) - Applications awaiting fee payment

**Design:**
- Red/orange alert styling
- Collapsible if no items
- Badge count in header

---

### 4. **Recent Applications Table**
**Purpose:** List of user's applications with key info

**Columns:**
- Service Name
- ARN (Application Reference Number)
- Status (with color badge)
- Submitted Date / Last Updated
- Actions (View Details, Track)

**Features:**
- Sortable columns
- Filter by status dropdown
- Pagination (if many applications)
- Status badges (color-coded):
  - 🟡 DRAFT
  - 🔵 SUBMITTED
  - 🟠 IN_PROGRESS
  - 🔴 QUERY_PENDING
  - 🟢 APPROVED
  - ⚫ REJECTED

**Design:**
- Clean table with hover effects
- Click row → application detail page
- Status column uses colored badges

---

### 5. **Notifications & Updates** (Optional Collapsible)
**Purpose:** Recent activity feed

**Shows:**
- Status changes
- Query responses from officers
- Document upload confirmations
- Certificate ready notifications
- System messages

**Design:**
- Timeline/feed style
- Time stamps
- "Mark as read" functionality
- Link to related application

---

## Additional Dashboard Features (Future Enhancements)

### 6. **Application Status Timeline** (On Detail View)
- Visual progress bar showing current stage
- Estimated completion date (based on SLS)
- Current officer/role handling

### 7. **Service Categories Quick Links**
- Grouped by category (Property, Utilities, Permissions, etc.)
- Most used services highlighted

### 8. **Profile Section** (Sidebar or Header Dropdown)
- User information
- Linked Aadhar
- Contact details
- Preferences (notifications, language)

### 9. **Help & Support**
- FAQs
- Contact support
- Video tutorials
- Service-specific guides

### 10. **Download Center**
- All certificates/documents in one place
- Filter by service type, date range
- Re-download capability

---

## User Journey Considerations

### **First-Time User:**
- Welcome message/tour
- Empty state: "Start by applying for a service"
- Prominent "Apply Now" CTA

### **Returning User:**
- Dashboard shows latest activity
- Quick access to pending items
- Recent applications at top

### **Power User:**
- Customizable dashboard (future)
- Saved filters
- Bulk actions

---

## Mobile Responsiveness

**Mobile Layout:**
- Stats cards stack vertically (2x2 grid)
- Quick actions become icon-only buttons
- Applications list becomes card view
- Requires attention section becomes swipeable cards
- Bottom navigation bar for key actions

---

## Data Requirements

### **API Endpoints Needed:**
1. `GET /api/v1/applications` - List user's applications
   - Query params: `status`, `limit`, `offset`, `sortBy`
   - Returns: Array of applications with summary data

2. `GET /api/v1/applications/stats` - Dashboard statistics
   - Returns: `{ total, active, pendingAction, approved }`

3. `GET /api/v1/applications/pending-actions` - Items requiring attention
   - Returns: Queries, document requests, payment requests

4. `GET /api/v1/notifications` - User notifications
   - Returns: Recent activity feed

---

## Design Principles

1. **Clarity First** - Information hierarchy clear
2. **Action-Oriented** - Prominent CTAs for common tasks
3. **Transparency** - Status visible, no hidden information
4. **Efficiency** - Minimal clicks to complete tasks
5. **Trust** - Clear status, timelines, and next steps

---

## Questions for Discussion

1. **Priority Order:** Which section is most important?
   - Should "Requires Attention" be at the top?
   - Or should "Recent Applications" be primary?

2. **Application List:** 
   - Table view vs Card view?
   - Default sort order (newest first vs status priority)?

3. **Notifications:**
   - Real-time vs periodic updates?
   - Email/SMS integration priority?

4. **Empty States:**
   - What should first-time users see?
   - How to guide them to first application?

5. **Filters & Search:**
   - How important is search by ARN?
   - Advanced filters needed initially?

6. **Status Definitions:**
   - Are all statuses clear to citizens?
   - Need tooltips/explanations?

---

## Next Steps

1. **Review this design** with stakeholders
2. **Prioritize components** for MVP vs future
3. **Create wireframes/mockups** for selected components
4. **Define API contracts** for dashboard data
5. **Implement dashboard** component by component
6. **User testing** with real scenarios

---

## MVP Scope Recommendation

**Phase 1 (Must Have):**
- Quick stats cards
- Recent applications table (basic)
- Requires attention section
- Quick actions bar

**Phase 2 (Nice to Have):**
- Notifications feed
- Advanced filters
- Application detail timeline
- Download center

**Phase 3 (Future):**
- Customizable dashboard
- Real-time updates
- Mobile app integration
- Analytics/insights
