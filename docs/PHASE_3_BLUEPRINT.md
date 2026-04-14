# Phase 3 Blueprint

## Objective
Turn the current portal from a strong operational product into a scalable, secure, high-confidence platform that performs smoothly under daily use, feels intentional on every screen size, and supports controlled growth without architectural drift.

Phase 3 should focus on four coordinated tracks:
1. performance and scale
2. security and trust
3. mobile and cross-surface polish
4. long-term quality and observability

## Track 1: Performance and Scale

### 1. Refresh orchestration redesign
The portal now has correct tracking logic, but refresh operations still need to become faster and more efficient at scale.

Target direction:
- queue-based refresh orchestration
- concurrency limits per source
- staged refresh by shipment priority
- smarter caching by source and milestone state
- refresh only the shipments that truly need live checking

Target outcomes:
- smoother dashboard refreshes
- reduced waiting time for users
- better behavior with large active shipment counts

### 2. Query and payload optimization
As the number of users, shipments, imports, and audit records grows, the current data-access patterns need a deliberate optimization pass.

Target direction:
- profile slow queries and serialization paths
- reduce repeated grouped-row recomputation where possible
- optimize shipment dashboard payload shape
- add indexes where justified by real query usage

### 3. Export and reporting efficiency
Exports should stay fast and predictable even with large datasets.

Target direction:
- optimize export assembly
- support filtered export intentionally
- prepare for larger user workspaces without blocking UI responsiveness

## Track 2: Security and Trust

### 4. Secure Google Sheets access
Phase 2 proved the user flow. Phase 3 should make it production-grade.

Target direction:
- Google OAuth sign-in
- read-only Sheets permission scope
- private sheet access without public-link exposure
- token lifecycle and connection management

This should replace the current development-stage shared-link dependency.

### 5. Role and permission hardening
The owner dashboard now exists. Phase 3 should make role boundaries explicit and safer.

Target direction:
- formal role model
- owner/admin/user capability boundaries
- protected destructive actions
- audit trail for account management operations

### 6. Credential and session hardening
Target direction:
- stronger password policy and guidance
- session handling review
- reset-flow hardening
- clearer account-state feedback

## Track 3: Mobile and Cross-Surface Polish

### 7. Mobile-specific UI refinement
Desktop now feels significantly calmer. Mobile should receive the same level of intent.

Target direction:
- full mobile refinement layer without disturbing desktop
- responsive dashboard surfaces that feel designed, not merely shrunk
- full-screen mobile sheets for detail and action surfaces
- cleaner filters and denser information rhythm on narrow screens

### 8. Table-to-card adaptation on small screens
Target direction:
- turn large dense tables into stacked record surfaces where appropriate
- preserve scannability without horizontal strain
- keep the product calm and touch-friendly

### 9. Product language sweep
Machine language should continue to be removed anywhere it survives.

Target direction:
- simpler labels
- calmer success and error feedback
- clearer admin/user messages
- less backend vocabulary leaking into the UI

## Track 4: Quality, Testing, and Observability

### 10. Full regression expansion
Core logic now has meaningful backend coverage, but automated confidence is still too narrow for the size of the product.

Target direction:
- broader backend regression coverage
- import scenarios across Excel and Google Sheets
- shipment status transitions
- owner flows and password flows
- export validation
- UI behavior tests for key journeys

### 11. Observability and diagnostics
As the portal scales, failures should become easier to diagnose without relying on guesswork.

Target direction:
- structured logging around imports and refreshes
- clearer background job visibility
- safer debug surfaces for owner/admin use
- better fault isolation between source ingestion and shipment creation

### 12. Technical debt reduction
Phase 3 should include a disciplined cleanup pass.

Target direction:
- separate tracking-source adapters more clearly
- reduce route-file sprawl
- extract services for imports, grouping, refresh, and milestone logic
- make future feature work safer and easier to reason about

## Proposed Phase 3 release slices

### Phase 3A
- refresh-performance redesign
- query and payload optimization
- dashboard and export speed improvements

### Phase 3B
- secure Google OAuth integration
- role/permission hardening
- account and session review

### Phase 3C
- mobile refinement layer
- responsive table/card adaptation
- language and visual polish pass

### Phase 3D
- regression-suite expansion
- observability improvements
- technical debt reduction and service extraction

## Success criteria
Phase 3 should be considered successful when:
- refreshes feel materially faster under real user load
- Google Sheets works securely without requiring public sharing
- mobile experience feels deliberate and premium
- owners can manage the system confidently without noisy tooling
- automated coverage protects the core workflows from regression
- the codebase is easier to extend without fragile side effects

## Product direction note
Phase 3 should not be about adding the most visible features first.

It should be about making the portal feel:
- faster
- safer
- quieter
- stronger under growth

That is the right next step for a product that now has real operational depth.
