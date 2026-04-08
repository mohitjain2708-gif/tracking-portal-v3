# Phase 2 Priority Roadmap

## Priority principle
The next phase should not start with the flashiest feature.

It should start with the features that reduce future rework and make later additions safer.

## Priority 1: Build the source foundation
Why first:
- every future source depends on this
- prevents data-model drift
- reduces future migration pain

Deliver:
- source model
- raw row preservation
- mapping persistence
- source sync run tracking

## Priority 2: Add Google Sheets read-only sync
Why second:
- immediate user value
- tests whether the source architecture is actually sound
- introduces cloud-source behavior without risky writeback yet

Deliver:
- Google authentication/connection setup
- sheet/tab selection
- saved mapping
- read-only sync into current shipment model

## Priority 3: Formalize shipment-cycle history
Why third:
- container reuse is already a real operational reality
- this is the right moment to make it first-class before more features depend on it

Deliver:
- cycle-aware history model
- related container cycles in Shipment Audit
- clearer separation between current cycle and prior cycles

## Priority 4: Make movement decisions explainable
Why fourth:
- improves operator trust
- reduces support confusion
- builds on the modular tracking foundation

Deliver:
- evidence-driven classification details
- source labels used in the decision
- date/event references for movement labels

## Priority 5: Customer master and name governance
Why fifth:
- important, but safer after source and cycle rules are stable

Deliver:
- canonical customer directory
- alias management
- merge/split tools
- suspicious-match review

## Priority 6: Document center upgrade
Why sixth:
- valuable, but stronger once shipment-cycle identity is more formally modeled

Deliver:
- document versioning
- replacement history
- richer document status model
- document timeline in Shipment Audit

## Priority 7: Controlled writeback and automation
Why last:
- best done after the data model is stable
- avoids pushing unstable assumptions back into user-managed sources

Deliver:
- approved Google Sheets writeback fields
- manual sync/writeback controls
- optional scheduled sync later

## Suggested execution order
1. source foundation
2. Google Sheets read-only sync
3. shipment-cycle history
4. classification explainability
5. customer master
6. document center
7. controlled writeback and automation

## Risks to avoid in Phase 2
- adding Google Sheets before source modeling is ready
- grouping different BL cycles into one shipment
- writing back to user-owned sheets too early
- bolting new logic onto the current model without preserving raw source rows

## What to keep from Phase 1.1
Phase 2 should preserve and build on:
- shipment-group logic
- cycle-aware archive/live handling
- Birgunj milestone logic
- Action Required correction flow
- Shipment Audit as the primary inspection surface

## Recommended kickoff
Begin Phase 2 with a technical design sprint covering:
1. source entities
2. raw row storage model
3. Google Sheets sync boundaries
4. cycle-history representation inside Shipment Audit
