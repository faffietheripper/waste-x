# Waste X Mobile — Step 12.7 End-to-End Certification

This is a real-record certification. Do not use a Mobile-only seed.

The selected load must be a normal Waste X `bb_job_load` created through the Web booking workflow and assigned to the Driver resolved for the signed-in Mobile account.

## Prerequisites

1. Apply the current development database schema so `bb_job_load_field_state` exists.
2. Waste X Web/API is running and Mobile is signed in.
3. Create one active own-transport Vehicle in **Transport → Vehicles**.
4. Create one active own Driver in **Transport → Drivers**.
   - The Driver email must exactly match the signed-in Waste X user's email (comparison is case-insensitive/trimmed).
   - For this V1 certification there must be exactly one active Driver with that email in the organisation.
   - Set the test Vehicle as the default vehicle where useful.
5. Book one normal incoming Job in **Jobs → Book a Job**.
   - Use today's date.
   - Use one permitted Material Profile and the normal receiving site/permit.
   - Transport mode: own transport.
   - Assign the certification Driver and Vehicle.
   - Planned loads: 1.
   - A note such as `MOBILE E2E CERTIFICATION` is recommended so the record is easy to identify later.
6. In Mobile, refresh the field workspace. The real Job/Load must appear under My Day/Jobs.

## Start the certification run

In a development build open **Account → Field E2E certification** and select the real cached assignment.

The harness stores the exact `jobId` + `loadId` in encrypted `local_sync_metadata` and never creates another operational record.

## Required field journey

Run the real driver flow on the selected load:

`Assigned → Started → En route → Arrived collection → Confirm waste → Confirm quantity/manual weight → Collected → In transit → Arrived destination → Delivery note (recommended) → Delivered`

Issue reporting should also be exercised on this certification Job if a harmless test issue is acceptable for the development data set. Use `OTHER` with a clearly labelled certification summary.

## Required offline/restart proof

At least one operational action must be performed with Cloud unavailable.

1. Turn connectivity/Cloud off.
2. Refresh Mobile until the app reports offline access rather than an online-authenticated session.
3. Perform at least one field action. It must succeed immediately from SQLCipher and create a pending outbox event.
4. In **Account → Field E2E certification**, press **Record offline + queued checkpoint**.
5. Fully terminate the Mobile app process.
6. Reopen Waste X Mobile while still offline.
7. Unlock with the valid offline entitlement / device authentication.
8. The same Job/Load and queued event must still exist.
9. The certification harness must mark **Encrypted record survived restart**.

The restart proof uses a per-process boot token. A checkpoint recorded in the same process cannot satisfy the restart assertion.

## Reconnect proof

1. Restore Cloud connectivity.
2. Allow Waste X Mobile to sync the pending queue.
3. Refresh the certification proof while online.
4. Required checks:
   - Driver scope matched.
   - Real assignment cached.
   - Same local Job/Load identity.
   - Workflow started.
   - Waste + quantity confirmed.
   - Offline checkpoint recorded.
   - Encrypted record survived restart.
   - Cloud queue fully drained.
   - Cloud exact Job/Load identity.
   - Cloud field state matches Mobile.
   - No conflicts / failures.
   - Field journey delivered.

The Cloud identity probe is authenticated and driver-scoped. It reads the canonical Job/Load, sync entity version and the durable `bb_job_load_field_state` sidecar.

## Web verification

Open the same Job in Waste X Web and confirm that the real load shows the Mobile-entered operational values that belong on `bb_job_load`, especially:

- same Job number / Load number,
- same waste description,
- actual net quantity / weight,
- delivery/issue operational notes where recorded.

The driver-facing field step remains deliberately separate from canonical waste/compliance `job_load.status`.

## Desktop verification

Run Desktop sync after the Mobile events reach Cloud.

Waste X emits the field step as `fieldWorkflow` inside the normal `job_load` change-feed payload, using the same `entityId` and entity version as the applied Mobile event. Desktop's current pull engine already stores the entire payload JSON, so this proof must not require a second Mobile/Desktop load identity.

For Step 12 certification, confirm the Desktop working set receives the same load after sync and that there is no conflict/duplicate operational record. A future product UI may surface the field-progress label more prominently, but the synced entity identity and payload are the Step 12 requirement.

## Pass condition

Step 12 is complete only after the real test run passes the Mobile harness and the Web/Desktop same-record checks above.

Until that happens, 12.4–12.6 remain **implemented / runtime assignment proof pending** and 12.7 remains **not certified**.
