# Phase 2 Execution Plan

## Goal
Turn the Phase 1 shipment portal into a source-agnostic logistics control tower that can support cloud sources, better governance, and safer collaboration.

## Phase 2 themes

### 1. Source-layer architecture
Create a formal source model so shipment master data can come from:
- Excel upload
- Google Sheets
- CSV/cloud links later
- API feeds later

**Target modules**
- `shipment_sources`
- `shipment_batches`
- `source_sync_runs`

### 2. Raw structure preservation
Preserve original input rows and original columns exactly as received.

**Target outcome**
- raw source row storage
- mapped operational fields stored separately
- tracking output appended without destroying source structure

### 3. Google Sheets integration
Implement Google Sheets in two stages.

**Stage 1**
- connect sheet
- choose tab
- save mapping
- read-only sync into portal

**Stage 2**
- write back only approved tracking columns
- manual refresh
- optional scheduled refresh later

### 4. Tracking engine modularization
Split tracking logic into adapters and shared normalization.

**Target adapters**
- LDB adapter
- CONCOR adapter
- future shipping-line adapters
- future BL-to-container resolver

**Target services**
- tracking fetch service
- result normalization service
- classification rules service

### 5. Classification explainability
Make the movement classification auditable.

**Target outcome**
- store why a container was classified
- store source evidence
- store event/date used for decision

This will help with operator trust and troubleshooting.

### 6. Customer master
Add a managed customer directory.

**Target features**
- canonical customer list
- alias review
- merge names
- split false merges
- search by alternate spellings

### 7. Document center
Upgrade BL document handling.

**Target features**
- version history
- who uploaded/replaced a file
- uploaded timestamp history
- download log
- preview support

### 8. Operations detail view
Add a proper BL detail panel.

**Target contents**
- all rows under one BL
- linked containers
- customer breakdown
- document status
- clearance doc number
- tracking evidence

### 9. Multi-user readiness
Prepare for controlled collaboration.

**Target features**
- role-friendly auth model
- proper session handling
- stricter production CORS
- environment-based demo disablement
- clean tenant/user isolation

### 10. Deployment maturity
Strengthen runtime behavior for public testing and later production.

**Target work**
- move from SQLite to Postgres for hosted use
- persistent file storage planning
- environment-based config hardening
- backup/restore policy

## Delivery order

### Step 1
Source tables + raw row preservation

### Step 2
Google Sheets read-only sync

### Step 3
Saved mappings by source/tab

### Step 4
Tracking/classification service extraction

### Step 5
Customer master UI

### Step 6
Document versioning and document center

### Step 7
Google Sheets writeback

### Step 8
Scheduling and sync automation

## Success criteria
Phase 2 is successful when:
- shipment master can come from local or cloud source
- raw source structure is preserved
- tracking remains enrichment-only
- operators can trust the classification logic
- user/testing data remains safely isolated
