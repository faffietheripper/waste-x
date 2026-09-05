# Stage 13 — Tickets, signatures & evidence

Status: redesigned around the real receiving-site workflow on `stage-13-tickets-evidence`.

## Research basis and terminology

This design separates three things that must not be conflated:

1. **Operational job/load state** — Waste X booking, driver progress, site acceptance/rejection and completion.
2. **Legal movement paperwork** — for example a non-hazardous waste transfer note (WTN) or, where applicable, a hazardous waste consignment note. This documentation belongs to the transfer/movement and is not a post-completion weighbridge ticket.
3. **Receiving-site / weighbridge ticket** — the receiving site's receipt/weight document after the site has received, checked and weighed the load. This is the Stage 13 “ticket”.

The design is based on current UK guidance reviewed in September 2026:

- Environment Agency waste duty of care guidance: non-hazardous transfers require an agreed written waste description/transfer information; hazardous movements use consignment notes.
- Environment Agency appropriate-measures guidance for permitted non-hazardous/inert facilities: receiving sites must visually check waste and transfer documentation, reject non-conforming waste where required, and weigh each load on arrival unless a reliable alternative system is used.
- DEFRA Digital Waste Tracking phase 1: permitted/licensed receiving sites in England and Wales must report received controlled waste from 1 October 2026, normally within 2 working days. DWT submission is therefore a post-receipt compliance workflow and must not block the physical yard from receiving a load when Cloud/DEFRA is unavailable.
- UK weighbridge practice: incoming vehicles are commonly identified/weighed on entry, tipped after site acceptance, weighed again or resolved against a known tare, and the receipt/weighbridge ticket is produced from the final transaction.

## Product rule: the Driver app is intentionally simple

The Waste X Driver/Mobile app is a transport execution tool, not a weighbridge or site-authority terminal.

For the core collection-to-own-site flow the Driver has exactly three operational status actions:

```text
ASSIGNED
  ↓ Mark collected
COLLECTED
  ↓ Mark in transit
IN_TRANSIT
  ↓ Arrived at destination
ARRIVED_DESTINATION
  ↓
Driver status work is finished.
```

Removed from the normal Driver workflow:

- Start job
- En route
- Arrive at collection
- Confirm waste
- Confirm quantity
- Manual gross/tare/net entry
- Confirm delivery as a separate fourth status
- Accept load
- Reject load
- Complete load
- Issue/generate/renumber site ticket
- Generate canonical site-ticket PDF

The booking already tells the Driver what to collect and where. The site, not the Driver, validates the received waste and final quantity.

## Receiving-site workflow

For an incoming load collected by the waste management company's Driver:

```text
WEB / DESKTOP
Job booked + Driver/vehicle assigned
        ↓
MOBILE
Mark collected
        ↓
Mark in transit
        ↓
Arrived at destination
        ↓
        ├────────── Driver has no more status actions
        ↓
WEB / DESKTOP — RECEIVING SITE
Load becomes ARRIVED / awaiting site decision
        ↓
Check transfer paperwork + waste + permit/EWC + site capacity
        ↓
Record weighbridge/weight data as appropriate
        ↓
        ├── REJECT → rejection record / reason / onward handling
        │
        └── ACCEPT
              ↓
          unload / final tare or final quantity
              ↓
          positive final net quantity
              ↓
          COMPLETE LOAD
              ↓
          generate/finalise receiving-site ticket
              ↓
          print / email / digital delivery
              ↓
          Mobile receives the same ticket read-only
              ↓
          DWT receipt is prepared/queued separately
```

### Why ARRIVED_DESTINATION is the Driver's final status

A Driver can truthfully state that the vehicle/load has reached the receiving site. The Driver cannot truthfully decide that the waste has been accepted by the permitted facility. Acceptance is a receiving-site decision after the site's checks.

Therefore `ARRIVED_DESTINATION` is the hand-off boundary between transport execution and site acceptance.

## Authority matrix

| Capability | Mobile / Driver | Web / Desktop receiving site |
| --- | --- | --- |
| View assigned job/load | Yes | Yes |
| Mark collected | Yes | View |
| Mark in transit | Yes | View |
| Mark arrived at destination | Yes | View / receives arrival |
| Validate actual waste / permit | No | Yes |
| Enter gross/tare/net/final quantity | No | Yes |
| Accept incoming load | No | Yes, after Driver arrival |
| Reject incoming load | No | Yes, after Driver arrival |
| Complete incoming load | No | Yes, after acceptance + final quantity |
| Create/finalise site ticket | No | Yes, after completion/final transaction |
| Generate canonical ticket PDF | No | Yes |
| Print/reprint | No | Desktop/site |
| Receive/view digital site ticket | Yes, read-only | Yes |
| Capture transport/field evidence | Yes | Optional/review |

## Hard authority rules

1. Mobile can only emit the three Driver status events plus explicitly permitted field-evidence/issue events.
2. Mobile cannot mutate `ticketNumber`, waste description, gross/tare/net weight, acceptance, rejection or completion.
3. Accept/reject on Web/Desktop is blocked until the latest Driver field state is `ARRIVED_DESTINATION` for Mobile-linked loads.
4. A Mobile `FIELD_ARRIVED_DESTINATION` event projects the incoming canonical load into site state `arrived`; site staff do not need a duplicate “Mark arrived” click.
5. Incoming completion requires site acceptance and a positive final net quantity.
6. The receiving-site ticket is not issued before site completion/final transaction.
7. Reprint reuses the same ticket number and same immutable PDF bytes.
8. DWT reporting is downstream of receipt/completion and is retryable; DEFRA/Cloud availability does not determine whether the yard can physically process a load.

## Transfer note vs site ticket

### Non-hazardous waste transfer note

A WTN (or alternative document containing the required transfer information) supports the transfer of non-hazardous controlled waste. It is associated with the handover/movement, not generated only after the receiving site has completed its weighbridge transaction.

Waste X should model this later as a **Movement Document**, separate from the site ticket:

```text
Movement document
  type = WTN | SEASON_TICKET_REFERENCE | OTHER_VALID_TRANSFER_DOCUMENT
  prepared/agreed for the movement
  signatures/acknowledgements as required
  available to the Driver during collection/transport
```

### Hazardous waste

Hazardous waste uses a consignment note. It must accompany the hazardous waste movement and has role-specific sections for producer/holder, carrier, consignor and consignee. It must not be represented by a generic post-completion Waste X weighbridge ticket.

Hazardous movement-document workflow is a separate compliance slice and must not be faked by Stage 13 ticketing.

### Receiving-site / weighbridge ticket

This is the Stage 13 canonical ticket. It is proof of the receiving-site transaction/weight and can be printed or delivered digitally after the site completes the load.

## Stage 13 ticket lifecycle

```text
NO_SITE_TICKET
    ↓ site has completed load with final transaction data
READY_TO_FINALISE
    ↓
ISSUED
    ↓
PDF_GENERATED
    ↓
PRINTED / DELIVERED_DIGITALLY
```

A rejected load does not receive a normal accepted-load ticket. It keeps an immutable rejection record and, where required, rejected-load/consignment documentation.

## Ticket identity and numbering

The site ticket remains one-to-one with `loadId`.

For offline-safe deterministic identity, Waste X may derive the human ticket reference from immutable booked identifiers:

```text
{JOB_NUMBER}-L{LOAD_NUMBER}-{LOAD_ID_PREFIX}
```

Example:

```text
WX-20260905-B9C1E7-L01-02B9FE3C
```

The UUID/load identity is canonical; the human ticket number is immutable once issued. Cloud never renumbers an issued ticket.

If commercial customers later require site-specific sequential weighbridge numbers, implement that as a configurable site numbering policy with pre-allocated offline ranges. Do not silently replace the deterministic MVP policy.

## PDF generation

Canonical ticket PDF generation belongs to Web/Desktop site authority, not Mobile.

Requirements:

- generated from final site/load data
- works with Cloud unavailable on Desktop when the completed transaction is already local
- exact bytes hashed with SHA-256 before storage
- encrypted local storage
- template version recorded
- original bytes reused for print/reprint
- survives Desktop restart

Recommended ticket content:

- site ticket number
- job/load reference
- receiving site
- customer/source
- waste description and EWC
- carrier/driver/vehicle
- arrival/completion timestamps
- gross/tare/net/final quantity and unit
- acceptance result
- issue timestamp
- immutable load identity

## Digital ticket on Mobile

There is no ticket workflow in the Driver status screen.

A completed job may display a separate read-only **Documents** section only when a site ticket actually exists:

```text
Documents
  Site ticket WX-...
  Issued by receiving site
  View offline copy (when cached)
```

Mobile may receive/cache/view/share according to policy. It cannot issue, edit, renumber or regenerate the canonical site document.

## Evidence and signatures

Evidence links primarily to `organisationId + jobId + loadId`; it does not depend on a ticket existing first.

This supports realistic capture during collection/transport/arrival.

Evidence types include:

- `GENERATOR_SIGNATURE`
- `DRIVER_SIGNATURE`
- `RECEIVER_SIGNATURE`
- `FIELD_PHOTO`
- `EXTERNAL_WEIGHBRIDGE_TICKET_PHOTO`
- `ATTACHED_DOCUMENT`
- `WASTE_X_SITE_TICKET_PDF`

Each evidence object records:

- evidence UUID
- organisation/job/load IDs
- evidence type / signer role where applicable
- captured timestamp
- optional signer name
- optional GPS + accuracy
- MIME type / byte size
- SHA-256
- encrypted local object reference
- upload state
- remote object reference after verified upload

## External weighbridge tickets

When Waste X delivers to a third-party site, that external site's weighbridge ticket remains external evidence:

```text
External site issues ticket
        ↓
Driver photographs/uploads it
        ↓
EXTERNAL_WEIGHBRIDGE_TICKET_PHOTO
        ↓
hash + load linkage + offline cache
```

Waste X must not relabel that document as a Waste X receiving-site ticket.

## Evidence upload

Binary upload lifecycle:

```text
LOCAL → HASHED → QUEUED → UPLOADING → UPLOADED → VERIFIED
```

Failures remain resumable and do not delete local bytes. Operational metadata sync and large-object upload are separate queues.

## Desktop printing

Printing consumes the already-finalised site-ticket PDF.

```text
immutable PDF
   ↓
discover printer
   ↓
select printer
   ↓
PRINT / REPRINT
   ↓
audit event
```

Reprint uses the same PDF SHA-256 and same ticket number.

Development includes a **Waste X Test Printer** so discovery, selection, print, reprint and failure audit can be tested without physical hardware.

## Retention

Local evidence is eligible for cleanup only after remote existence and SHA-256 have been verified, the retention period has elapsed, and there is no pending retry/conflict/legal hold. Ticket PDFs may use a longer or permanent Desktop retention policy.

## DWT boundary

From 1 October 2026, permitted/licensed receiving sites in England and Wales must report controlled waste receipts through DEFRA's Report receipt of waste service, normally within 2 working days.

Waste X therefore treats DWT as:

```text
site receipt/completion
      ↓
prepare DWT receipt
      ↓
submit now OR queue/retry
      ↓
store DEFRA reference/status
```

The receiving-site ticket does not wait for a live DEFRA response. DWT failure is a compliance retry state, not a reason to fabricate or block physical receipt history.

## Certification plan after redesign

### A — streamlined Driver workflow

1. Fresh booked load appears on Mobile as `ASSIGNED`.
2. Only `Mark collected` is available.
3. Then only `Mark in transit`.
4. Then only `Arrived at destination`.
5. No Start/En route/Arrive collection/quantity/weight/delivery/ticket generation controls exist.
6. Run one action offline, restart, reconnect and prove queue reconciliation.

### B — authority hand-off

1. Before Driver arrival, Web/Desktop Accept and Reject are blocked.
2. Driver marks `ARRIVED_DESTINATION`.
3. Same load becomes `arrived` / awaiting site decision.
4. Web/Desktop can now Accept or Reject.
5. Mobile cannot accept/reject.

### C — acceptance, weight and completion

1. Accept the load on Web/Desktop after site checks.
2. Enter/confirm site weight data.
3. Positive final net quantity is required.
4. Complete the load on Web/Desktop.
5. DWT receipt is prepared/queued separately.

### D — site ticket

1. Before completion, normal site ticket generation is unavailable.
2. After completion/final transaction, generate/finalise the site ticket.
3. Generate immutable PDF and SHA-256 locally.
4. Restart Desktop and verify same ticket/PDF/hash.
5. Reconnect and reconcile.
6. Mobile receives the ticket in a read-only Documents section.

### E — evidence and printing

Certify signatures/photos/documents offline, resumable uploads, Test Printer discovery/print/reprint and retention guards.

## Section 13 checklist

- [ ] Streamlined Driver workflow: Collected → In transit → Arrived destination
- [ ] Site-only Accept / Reject after Driver arrival
- [ ] Site-only weights and completion
- [ ] Generate receiving-site ticket completely offline on Desktop after completion
- [ ] Local ticket numbering strategy
- [ ] PDF generation
- [ ] Local printer discovery on Desktop
- [ ] Select printer
- [ ] Print
- [ ] Reprint exact PDF
- [ ] Record print event
- [ ] Digital ticket on Mobile — receive/cache/view only
- [ ] Capture generator/site signature
- [ ] Capture driver signature
- [ ] Capture receiver signature
- [ ] Capture photographs
- [ ] Camera integration
- [ ] Attach documents
- [ ] Photograph external weighbridge ticket
- [ ] Local encrypted evidence storage
- [ ] SHA-256 evidence
- [ ] Link evidence to job/load
- [ ] Optional GPS metadata
- [ ] Evidence remains viewable offline
- [ ] Queue R2/S3 uploads
- [ ] Resume failed uploads
- [ ] Sync evidence metadata to Cloud
- [ ] Local retention/deletion after verified successful sync
