# Phase 3 Priority Roadmap

## Priority principle
Phase 3 should start with the changes that most improve trust at scale.

That means speed, security, and stability come before additional feature breadth.

## Priority 1: Refresh and dashboard performance
Why first:
- users feel speed immediately
- refresh delay is one of the clearest remaining friction points
- performance work reduces pressure on every later phase

Deliver:
- refresh orchestration review
- smarter refresh scope and ordering
- source-aware caching improvements
- query and serialization profiling
- dashboard payload optimization

## Priority 2: Secure Google Sheets access
Why second:
- current shared-link mode is acceptable for development but not for real user trust
- this is the biggest remaining source-security gap

Deliver:
- Google OAuth read-only access
- private-sheet connection flow
- token and connection handling
- calm user-facing connection management

## Priority 3: Mobile refinement without disturbing desktop
Why third:
- desktop is now strong enough to preserve
- mobile experience still needs a deliberate design layer
- this delivers visible quality without destabilizing core logic

Deliver:
- mobile dashboard refinement
- mobile shipment detail and action flows
- touch-friendly filters and controls
- table-to-card adaptation where appropriate

## Priority 4: Regression and test expansion
Why fourth:
- the product is now broad enough that manual confidence alone is not sufficient
- stronger tests reduce future fear and rework

Deliver:
- backend coverage expansion for imports, transitions, exports, and owner flows
- frontend interaction tests for key journeys
- regression harness for milestone and source logic

## Priority 5: Owner and admin trust layer
Why fifth:
- ownership capabilities now exist, but they need stronger safety and visibility as usage grows

Deliver:
- clearer role boundaries
- owner audit visibility
- safer destructive-user actions
- calmer system-health surfaces

## Priority 6: Service extraction and technical debt reduction
Why sixth:
- Phase 2 accumulated meaningful business logic in central route files
- future growth will be safer if responsibilities are separated now

Deliver:
- tracking-source adapters split more cleanly
- import services extracted
- grouping and milestone logic modularized
- route-layer slimming

## Priority 7: Advanced product depth
Why last:
- once the product is faster, safer, and better tested, we can expand higher-order value more safely

Deliver:
- customer master improvements
- document history/versioning
- richer analytics and operational insight views
- scheduled sync and automation on top of secure foundations

## Suggested execution order
1. refresh and dashboard performance
2. secure Google Sheets access
3. mobile refinement
4. regression and test expansion
5. owner/admin trust layer
6. service extraction and technical debt reduction
7. advanced product depth

## What is intentionally not Phase 3 priority one
Phase 3 should not begin with:
- additional noisy dashboard widgets
- deeper analytics before system speed improves
- source writeback before secure read access is solved
- major desktop redesigns that disturb a now-stable surface

## What Phase 3 should protect
Phase 3 should preserve and build on:
- milestone-based movement logic
- Birgunj truth rules
- cycle-aware shipment handling
- source provenance and import memory
- calmer intake workflow surfaces
- owner and user account management flows

## Recommended kickoff
Start Phase 3 with a focused technical-product sprint on:
1. refresh bottleneck analysis
2. secure Google integration design
3. mobile behavior design map
4. regression-suite expansion plan

This keeps the next phase disciplined, measurable, and aligned with long-term product quality.
