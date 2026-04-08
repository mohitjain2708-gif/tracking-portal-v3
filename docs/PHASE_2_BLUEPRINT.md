# Phase 2 Blueprint

## Objective
Transform the current shipment portal from a hardened single-source operational tool into a source-flexible logistics control platform that can handle multiple intake channels, preserve shipment-cycle history, and support richer operator decision-making.

## Product direction
Phase 2 should not be treated as a loose feature bucket.

It should be treated as three coordinated tracks:
1. source architecture
2. operational intelligence
3. product depth

## Track 1: Source Architecture

### 1. Source model
Introduce a formal source layer so shipments can originate from:
- Excel uploads
- Google Sheets
- future CSV link sources
- future API sources

Suggested entities:
- `shipment_sources`
- `source_connections`
- `source_sync_runs`
- `shipment_batches`
- `raw_source_rows`

### 2. Raw row preservation
Preserve original row structure exactly as received.

Target behavior:
- keep original source row JSON
- keep original source headers
- store mapped shipment fields separately
- keep later tracking enrichment separate from raw input

### 3. Mapping persistence
Allow users to save source mappings by source and sheet/tab.

Target behavior:
- saved column mappings
- saved preferred sheet/tab
- reusable import profile per source
- source-specific validation rules

### 4. Google Sheets integration
Stage 1:
- connect a sheet
- choose worksheet/tab
- save mapping
- read-only sync into the portal

Stage 2:
- controlled writeback of approved tracking fields
- manual sync trigger
- optional scheduled sync later

## Track 2: Operational Intelligence

### 5. Tracking engine modularization
Split tracking logic into adapters and shared services.

Target adapters:
- LDB adapter
- CONCOR adapter
- Pristine adapter
- future carrier adapters

Target services:
- tracking fetch orchestrator
- normalization service
- movement classification service
- shipment-cycle evidence service

### 6. Shipment-cycle awareness
Introduce formal cycle logic around container reuse.

Target behavior:
- same container with different BL is treated as a new shipment cycle
- previous cycles remain accessible in history
- current cycle remains operationally isolated

This should later power:
- `Related Container Cycles`
- `Container History`
inside Shipment Audit.

### 7. Classification explainability
Every movement label should become explainable.

Target behavior:
- show why a shipment is classified as Arrived Birgunj, On Rail, At Port, or Hi Seas
- preserve source evidence used for that decision
- preserve the event/date used for the classification

### 8. Better milestone intelligence
Expand audit and shipment context with business-facing milestones such as:
- origin port arrival
- rail departure
- first Birgunj arrival
- completion date
- archive date

## Track 3: Product Depth

### 9. Customer master
Add a managed customer directory.

Target behavior:
- canonical customer list
- alias review
- merge names
- split false merges
- review suspicious near-duplicates

### 10. Document center
Upgrade BL document handling from simple storage to managed document workflow.

Target behavior:
- version history
- replacement history
- document timeline
- clearer status model
- future download history or audit trail

### 11. Register and history experience
Turn completed and archived registers into richer operational history surfaces.

Target behavior:
- stronger filtering
- export views
- cycle history visibility
- restore/archive history explanation

### 12. UI refinement pass
Continue the premium product direction.

Target behavior:
- calmer hierarchy
- more intentional spacing
- less admin-software noise
- stronger consistency between dashboard, audit, and history views

## Proposed Phase 2 release slices

### Phase 2A
- source tables
- raw row preservation
- mapping persistence
- Google Sheets read-only sync

### Phase 2B
- tracking engine modularization
- classification explainability
- cycle-history model
- related container cycles in audit

### Phase 2C
- customer master
- document center upgrades
- stronger register/history views
- controlled Google Sheets writeback

## Success criteria
Phase 2 should be considered successful when:
- users can operate from both Excel and Google Sheets without data-model confusion
- reused containers are correctly represented as distinct cycles with visible history
- movement decisions are explainable
- source data is preserved, not flattened beyond recovery
- the portal feels like a reliable operating system, not just a tracker
