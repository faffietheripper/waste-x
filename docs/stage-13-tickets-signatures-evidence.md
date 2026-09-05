# Stage 13 — Tickets, signatures & evidence

Status: redesign in progress on `stage-13-tickets-evidence`.

## Core authority rule

The Waste X Driver/Mobile app **never creates, numbers, renumbers or finalises the management-site ticket**.

Mobile is the field evidence device. It records what happened in the field, including delivery confirmation and signatures/photos. The management/site workflow is the ticket authority. Desktop generates the canonical Waste X ticket from the site's encrypted local record after the movement has reached the required state.

This rule removes the earlier experimental Mobile ticket issuer from the Stage 13 design.

## Authority matrix

| Capability | Mobile / Driver | Desktop / Management site | External third party |
| --- | --- | --- | --- |
| Start / progress field journey | Yes | View/reconcile | No |
| Confirm delivery | Yes | View/reconcile | No |
| Generate Waste X ticket number | **No** | **Yes** | No |
| Generate Waste X PDF | **No** | **Yes** | No |
| Print / reprint Waste X ticket | No | **Yes** | No |
| Receive/view digital Waste X ticket | **Yes** | Yes | Optional |
| Capture generator/site signature | Yes | Optional | No |
| Capture driver signature | Yes | Optional | No |
| Capture receiver signature | Yes | Optional | No |
| Capture field photos | Yes | Optional | No |
| Supply external weighbridge ticket | Capture as evidence | Store/review | External authority issues it |
| Upload evidence | Queue locally first | Queue locally first | No |

## Non-negotiable invariants

1. Driver/Mobile cannot issue or alter the canonical management-site ticket number.
2. A management-site Waste X ticket is one-to-one with the immutable Waste X load identity.
3. Where a Mobile journey exists, the site cannot issue the ticket until the Driver has confirmed delivery and the local Desktop working set contains `FIELD_DELIVERED` / `DELIVERED`.
4. The site may generate the ticket and PDF with Waste X Cloud unavailable, provided the required delivery state and load data are already present locally.
5. Cloud is never used as a ticket-number counter.
6. Reprint never creates a new ticket number or a new PDF identity.
7. Signatures/photos captured before ticket issue attach to `jobId + loadId`; once the one-to-one ticket is issued they automatically belong to that same movement/ticket chain.
8. Every PDF, signature, photograph, external document and print event is SHA-256 hashed or references a hashed immutable object.
9. Evidence is committed to encrypted local storage before upload is attempted.
10. Cloud/R2/S3 reconciliation never deletes the only local copy.
11. Uploads are resumable and independently retryable from operational metadata sync.
12. Printing consumes the already-finalised PDF; printing cannot mutate the ticket.
13. Development printing must be certifiable without owning a physical printer.
14. A third-party weighbridge ticket remains third-party evidence. Waste X must not pretend the Driver or Waste X management site issued that external document.

## Canonical movement sequence

The primary Stage 13 certification flow is:

```text
Mobile / Driver
  assigned load
      ↓
  collect waste
      ↓
  capture generator/site evidence as required
      ↓
  travel to destination
      ↓
  capture receiver evidence as required
      ↓
  CONFIRM DELIVERY
  FIELD_DELIVERED
      ↓
      │  Cloud sync OR local Bridge relay
      ▼
Desktop / Management site
  local working set sees DELIVERED
      ↓
  verify/accept site receipt
      ↓
  confirm actual waste + gross/tare/net weight
      ↓
  ISSUE CANONICAL WASTE X TICKET
      ↓
  generate immutable PDF locally
      ↓
  print / reprint if required
      ↓
  complete/finalise site load
      ↓
      │  sync when available
      ▼
Mobile / Driver
  receives/caches the same digital ticket
  no issue/renumber control exists
```

### Important offline rule

“Generate ticket completely offline” means **Cloud is not required for issuance**. It does not mean Desktop may invent a delivery state it has never received.

If the Driver has confirmed delivery while Cloud is unavailable, Desktop can unlock ticket issue as soon as that `FIELD_DELIVERED` event reaches Desktop through Waste X Bridge/local relay. If neither Cloud nor Bridge has delivered the field event yet, Desktop must remain locked and display why.

That protects the chronology of the movement.

## 13.1 — Ticket eligibility & authority

### Desktop owns issuance

Ticket issue is exposed only from the management/site Desktop workflow.

For a Mobile-linked load, Desktop requires:

- same immutable `jobId + loadId`
- `fieldWorkflow.step === "DELIVERED"`
- load not cancelled/rejected
- site-side operational state valid for finalisation
- actual waste description present
- positive final net quantity
- required driver/vehicle identity present

For an incoming own-site load, site acceptance must happen before ticket issue.

If a load has no Mobile field workflow at all, a future explicit “site-controlled / no Mobile journey” policy may allow authorised management users to issue against the site record. That is a separate audited exception path; it must not silently bypass a Mobile journey that exists.

### Mobile owns delivery confirmation, not ticket authority

Mobile ticket UI states are read-only:

- `WAITING FOR DELIVERY` — Driver journey not yet delivered
- `WAITING FOR SITE TICKET` — delivery confirmed; management site has not issued yet
- `TICKET RECEIVED` — canonical ticket number exists on the load and is cached locally
- `DOCUMENT AVAILABLE` — immutable site-generated PDF/evidence object has synced to the device

There is no Mobile “Issue ticket” or “Generate PDF” action.

## 13.2 — Local ticket numbering strategy

Ticket numbering must work without a Cloud counter and must be deterministic for the same load.

Waste X already gives every Job and Load a stable identity before field operation. The management-site number is derived from those immutable values:

```text
{JOB_NUMBER}-L{LOAD_NUMBER}-{LOAD_ID_PREFIX}
```

Example:

```text
WX-20260905-B9C1E7-L01-02B9FE3C
```

Properties:

- deterministic for the same job/load
- no Cloud round-trip
- safe if two authorised site Desktops temporarily attempt the same load
- human-recognisable
- canonical load UUID remains the collision-resistant identity
- Cloud never renumbers an issued ticket

If the load already contains an authorised ticket number from Cloud/Desktop, Desktop adopts that number rather than replacing it.

The ticket is one-to-one with `loadId`. Internally, Waste X treats the immutable load identity as the canonical ticket anchor and the human ticket number as an immutable issued reference.

## 13.3 — Offline PDF generation

PDF generation belongs to Desktop/site because the site owns the final ticket.

The PDF is rendered only after ticket issuance from the frozen site/load snapshot.

Requirements:

- no Cloud/API call required
- generated from encrypted local data
- one immutable PDF per issued ticket version
- exact PDF bytes SHA-256 hashed before storage
- encrypted local storage
- template version recorded
- generation timestamp recorded
- original bytes reused for every reprint
- PDF remains available after app restart and while offline

The PDF must include at minimum:

- Waste X ticket number
- Job / Load reference
- movement direction
- movement/delivery timestamps
- origin and destination
- waste description and EWC
- gross / tare / net and metric
- driver / vehicle / carrier
- site / permit identity where applicable
- issue timestamp
- ticket/load immutable identity
- template version

## 13.4 — Digital ticket on Mobile

Mobile receives the site-generated ticket through the same load identity.

When the Cloud/Bridge working set contains the ticket number, Mobile caches it with the assignment. When the generated ticket PDF/evidence metadata is available, Mobile caches the document for offline viewing.

Mobile may:

- display ticket number
- display issue/site status
- view cached PDF offline
- show evidence/signature status
- share/export only where product policy allows

Mobile may **not**:

- create a ticket number
- edit a ticket number
- regenerate a canonical PDF
- replace the site's PDF
- mark an external third-party ticket as Waste X-issued

## 13.5 — Signatures

Signatures are evidence records, not ticket-number generators.

Roles:

- `GENERATOR_SITE`
- `DRIVER`
- `RECEIVER`

A signature can be captured before the final site ticket exists. It initially links to `organisationId + jobId + loadId`. Because the Waste X ticket is one-to-one with the load, it becomes part of the same ticket evidence chain after site issue.

Each signature stores:

- evidence UUIDv7
- organisation ID
- job ID
- load ID
- signer role
- optional signer name
- capture timestamp
- optional GPS latitude/longitude/accuracy
- MIME type / dimensions
- SHA-256
- encrypted local object reference
- upload status
- remote object reference after upload

The Driver signature must be a separate evidence object from the generator/receiver signature even if captured on the same device.

## 13.6 — Photographs, camera & documents

Evidence types:

- `FIELD_PHOTO`
- `EXTERNAL_WEIGHBRIDGE_TICKET_PHOTO`
- `ATTACHED_DOCUMENT`
- `SIGNATURE_IMAGE`
- `WASTE_X_TICKET_PDF`

Acquisition rules:

- camera capture writes encrypted local bytes first
- attached files are copied into Waste X-controlled encrypted storage before upload
- SHA-256 is calculated before upload
- evidence remains viewable offline
- optional GPS metadata is captured only when available/authorised
- evidence is always linked to job/load

### External weighbridge ticket

If a third-party destination issues its own weighbridge ticket:

```text
Third-party site issues external ticket
        ↓
Driver photographs it in Mobile
        ↓
Waste X stores image as EXTERNAL_WEIGHBRIDGE_TICKET_PHOTO
        ↓
SHA-256 + load linkage + timestamp (+ optional GPS)
        ↓
Upload when connectivity returns
```

The external ticket does not become the Waste X-issued canonical site ticket. Both can coexist on the same movement record.

## 13.7 — Encrypted local evidence storage

Mobile uses SQLCipher/device secure storage; Desktop uses the existing encrypted SQLCipher local database/application-data boundary.

Binary objects must never be referenced only by a temporary camera/download path.

Evidence lifecycle:

```text
CAPTURED_LOCAL
   ↓
HASHED
   ↓
QUEUED
   ↓
UPLOADING
   ↓
UPLOADED
   ↓
VERIFIED
   ↓
RETENTION_ELIGIBLE
```

Failure states stay explicit and retryable:

- `UPLOAD_FAILED`
- `HASH_MISMATCH`
- `REMOTE_VERIFY_FAILED`
- `CONFLICT`

No failure state auto-deletes local bytes.

## 13.8 — R2/S3 upload & metadata sync

Large binary evidence upload is independent of ordinary operational event sync.

Metadata sync must not be blocked forever by a large photo upload, and a large photo upload must be resumable without replaying unrelated operational events.

For each evidence object Waste X records:

- evidence ID
- job/load identity
- content type
- byte size
- SHA-256
- upload state
- attempt count
- last error
- remote bucket/key after allocation
- remote verification state
- created/captured/uploaded/verified timestamps

Failed uploads resume from the same evidence identity rather than creating duplicates.

## 13.9 — Desktop printer adapter

Printing is a Desktop/site responsibility.

Printer adapter boundary:

```text
finalised immutable PDF
        ↓
printer discovery
        ↓
selected/default printer
        ↓
submit exact PDF bytes
        ↓
record PRINT event
```

Reprint:

```text
same ticket ID
same ticket number
same PDF SHA-256
        ↓
submit exact original bytes again
        ↓
record REPRINT event
```

A print event records:

- event UUID
- ticket/load identity
- `PRINT` or `REPRINT`
- printer ID/name
- submitting user
- Desktop device ID
- submitted PDF SHA-256
- submitted timestamp
- result (`SUCCESS`, `FAILED`, `CANCELLED`)
- OS/test-printer job reference when available
- error text when failed

### Development without a physical printer

Development exposes a **Waste X Test Printer** through the same adapter interface.

It behaves like a discovered printer but writes the submitted immutable PDF to a Waste X test-output directory and records the same print audit event.

This allows certification of:

- discovery
- selection
- default printer
- print
- reprint
- exact-byte reuse
- print audit
- simulated printer unavailable
- simulated print failure

A physical printer is only needed later to validate OS driver behaviour, paper size, margins and physical output.

## 13.10 — Retention & deletion

Successful upload alone is not permission to delete local evidence.

Local bytes become eligible for cleanup only when all are true:

- upload state is `VERIFIED`
- remote object exists
- remote metadata points to the same organisation/job/load/evidence ID
- local and remote SHA-256 agree
- configured retention period has elapsed
- no pending retry exists
- no conflict exists
- no legal hold / investigation hold is active

Pending, failed, conflicted or unverified evidence is never automatically deleted.

Ticket PDF retention should be longer than ordinary transient upload cache and may be configured as permanent local history on management-site Desktop.

## Stage 13 certification plan

### Certification A — field authority boundary

1. Create a fresh real job/load.
2. Confirm Mobile shows no ticket-issue control.
3. Try Desktop ticket issue before delivery: must be blocked with `Driver delivery confirmation required`.
4. Progress Mobile to `DELIVERED`.
5. Sync or Bridge relay the field state to Desktop.
6. Desktop ticket eligibility unlocks.

### Certification B — offline site ticket + PDF

1. Desktop has `DELIVERED` state and final site data cached.
2. Disconnect Waste X Cloud.
3. Issue ticket on Desktop.
4. Confirm deterministic ticket number.
5. Confirm PDF generated locally.
6. Record SHA-256.
7. Fully close/reopen Desktop.
8. Confirm same ticket number, same PDF and same SHA-256 survive.
9. Reconnect Cloud.
10. Confirm the same ticket number reconciles to the same `jobId + loadId`.

### Certification C — Mobile receives, never generates

1. Reconcile Mobile after site ticket issue.
2. Confirm the same ticket number appears.
3. Confirm no issue/edit/regenerate control exists.
4. Disconnect Mobile.
5. Confirm ticket remains visible offline.

### Certification D — evidence

1. Capture generator/site signature offline.
2. Capture driver signature offline.
3. Capture receiver signature offline.
4. Capture a field photo.
5. Photograph a mock external weighbridge ticket.
6. Attach a document.
7. Restart Mobile offline and confirm all evidence remains viewable.
8. Reconnect and verify resumable upload + Cloud metadata.

### Certification E — printing without hardware

1. Discover `Waste X Test Printer`.
2. Select it.
3. Print the ticket.
4. Verify output file matches stored PDF SHA-256.
5. Reprint.
6. Verify second print event is `REPRINT` and ticket/PDF identities did not change.
7. Simulate failure and verify failed print event remains auditable/retryable.

## Section 13 completion checklist

- [ ] Generate ticket completely offline — Desktop/site
- [ ] Local deterministic ticket numbering — Desktop/site
- [ ] PDF generation — Desktop/site
- [ ] Local printer discovery — Desktop
- [ ] Select printer — Desktop
- [ ] Print — Desktop
- [ ] Reprint — Desktop
- [ ] Record print event — Desktop
- [ ] Digital ticket on Mobile — receive/cache only
- [ ] Capture generator/site signature
- [ ] Capture driver signature
- [ ] Capture receiver signature
- [ ] Capture photographs
- [ ] Camera integration
- [ ] Attach documents
- [ ] Photograph external weighbridge ticket
- [ ] Local encrypted evidence storage
- [ ] SHA/hash evidence
- [ ] Link evidence to job/load
- [ ] Optional GPS metadata
- [ ] Evidence remains viewable offline
- [ ] Queue R2/S3 uploads
- [ ] Resume failed uploads
- [ ] Sync evidence metadata to Cloud
- [ ] Local retention/deletion rules after verified successful sync
