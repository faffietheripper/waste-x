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
- [ ] Start job
- [ ] Mark en route
- [ ] Arrive at collection
- [ ] Confirm waste
- [ ] Confirm quantity
- [ ] Manual weight entry where required
- [ ] Mark collected
- [ ] Mark in transit
- [ ] Arrive at destination
- [ ] Confirm delivery
- [ ] Delivery notes
- [ ] Report issue
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

3. **12.4 — Operational state machine**
   - Start → en route → collection arrival → collected → in transit → destination arrival → delivered.
   - Every action is a local transaction plus SyncEvent/outbox entry.

4. **12.5 — Waste, quantity and weight confirmation**
   - Manual weight is the V1 primary path.
   - Record weight source so later weighbridge/hardware integrations remain additive.

5. **12.6 — Delivery notes, issues and terminal states**
   - Delivery notes, issue reporting, cancelled and completed workflows.

6. **12.7 — End-to-end certification**
   - Web assigns an existing load.
   - Mobile receives/caches it.
   - Phone works offline and survives restart.
   - Field actions queue locally.
   - Reconnect through Cloud or trusted Bridge transport.
   - Web/Desktop show the same record with no duplicate event identity.
