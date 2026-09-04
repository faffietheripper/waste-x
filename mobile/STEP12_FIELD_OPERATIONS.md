# Waste X Mobile — Step 12 Field Operations

Step 12 turns the local-first Mobile foundation into the field operator product.
The same Cloud job/load IDs remain authoritative across Web, Desktop and Mobile.
Mobile reads its authorised SQLCipher working set first and writes operational actions locally before any transport is required.

## Acceptance checklist

- [x] Mobile app shell
  - [x] Secure auth/offline-unlock entry gate
  - [x] My Day / Jobs / Account navigation
  - [x] Online/offline + queued-event status in the operational UI
  - [x] SQLCipher-first operational reads
- [x] My Day
  - [x] Today's active/carry-over work
  - [x] Upcoming preview
  - [x] Offline empty/scope-safe states
- [x] Assigned jobs list
- [x] Upcoming jobs list
- [x] Job details
  - [x] Load-centric detail route using the existing load ID
  - [x] Job/load status, date, references, PO, ticket and notes
  - [x] Waste/EWC/material and current weight summary
  - [x] Detail route re-checks Mobile authorisation
  - [x] Detail data reads from SQLCipher without requiring Cloud
- [x] Site details
  - [x] Origin/collection site
  - [x] Destination/delivery site
  - [x] Site type, address and postcode where available
- [x] Driver/vehicle details
- [x] Start job
- [x] Mark en route
- [x] Arrive at collection
- [x] Confirm waste
- [x] Confirm quantity
- [x] Manual weight entry where required
- [x] Mark collected
- [x] Mark in transit
- [x] Arrive at destination
- [x] Confirm delivery
- [x] Delivery notes
- [x] Report issue
- [x] Cancelled jobs list
- [x] Completed jobs list
- [x] Offline operation foundation reused from Step 11
- [x] Operational outbox foundation reused from Step 11
- [x] Opportunistic automatic sync when an authenticated Mobile field workspace reconciles with Cloud
- [ ] Full Web/Desktop update proof from the same job/load record

## Build sequence

1. **12.1 / 12.2 — Shell + My Day** ✅
   - Replace Step 11 diagnostics with the real field UI.
   - Read cached assignments from SQLCipher before Cloud reconciliation.
   - Keep unfinished past-dated work visible as carry-over work.

2. **12.3 — Job + site details** ✅
   - One load-centric field screen using the existing job/load IDs.
   - Route, site addresses, waste/EWC, quantity/weight, driver, vehicle, references and notes.
   - Open the same cached detail from My Day or Jobs while online or offline.

3. **12.4 — Operational state machine** ✅ implementation / runtime assignment proof pending
   - Assigned → started → en route → collection arrival → collected → in transit → destination arrival → delivered.
   - Driver field progress is separate from canonical waste/compliance load status so receiving and DWT rules remain intact.
   - Every action updates the encrypted local assignment and inserts a durable SyncEvent/outbox record in one local transaction.
   - Cloud validates event order against the last APPLIED workflow event for the same job_load ID.
   - Bootstrap reconstructs field progress from Cloud event history so a successful refresh cannot reset progress to Assigned.
   - Online actions attempt immediate Cloud sync; offline actions remain queued without blocking field work.

4. **12.5 — Waste, quantity and weight confirmation** ✅ implementation / runtime assignment proof pending
   - Collection arrival exposes an inline driver confirmation gate on the same job/load detail screen.
   - Waste confirmation updates the real job-load waste description and records confirmation metadata on the immutable LOAD_DETAILS_UPDATED event.
   - Quantity confirmation writes the canonical net weight + metric and records whether the value is actual or estimated.
   - Manual weight accepts gross + tare, calculates net with operations-core validation, and records the canonical weight source as manual.
   - Gross/tare/net, estimate flag and source are hydrated back through Mobile bootstrap.
   - Bootstrap reconstructs collection confirmation ticks from APPLIED sync-event history, so Cloud refresh does not erase field confirmation state.
   - Mobile and Cloud both refuse FIELD_COLLECTED until waste and quantity/manual-weight confirmation are present.

5. **12.6 — Delivery notes, issues and terminal states** ✅ implementation / runtime assignment proof pending
   - Delivery notes are immutable FIELD_DELIVERY_NOTE_ADDED events on the same job_load and are allowed after destination arrival before final field delivery.
   - Field issues are immutable FIELD_ISSUE_REPORTED events with delay, site access, waste mismatch, vehicle, safety and other categories.
   - Reporting an issue records the problem without silently cancelling the job.
   - Cloud appends delivery notes/issues to the canonical job-load operational notes while keeping the structured immutable event history.
   - Mobile bootstrap rehydrates structured delivery/issue activity from APPLIED events after sync or restart.
   - Canonical terminal loads, cancelled/draft parent jobs and delivered field journeys are read only on Mobile and Cloud.
   - Assigned cancelled jobs/loads remain in the 14-day Mobile working set so the Cancelled tab is backed by real Cloud data rather than an unreachable UI state.
   - A field journey at DELIVERED is treated as completed driver work in Mobile while canonical waste/compliance status remains separately visible.

6. **12.7 — End-to-end certification**
   - Create or uniquely link a real Driver to the signed-in Mobile account.
   - Web assigns an existing job/load to that Driver and vehicle.
   - Mobile receives/caches the same job/load IDs.
   - Phone works offline and survives restart.
   - Run the full field journey, collection confirmations, delivery note and issue path with actions queued locally.
   - Reconnect through Cloud or trusted Bridge transport.
   - Confirm Web/Desktop show the same record, notes, weights and terminal field state with no duplicate event identity.
