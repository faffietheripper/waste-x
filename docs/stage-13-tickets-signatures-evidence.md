# Stage 13 — Tickets, signatures & evidence

Status: in progress on `stage-13-tickets-evidence`.

## Non-negotiable invariants

1. A Mobile field ticket can be issued with Waste X Cloud completely unavailable.
2. The canonical ticket identity never changes after issue.
3. Reprint never creates a new ticket number.
4. Every PDF, signature, photograph, document and print event links to the same job/load/ticket identity.
5. Mobile evidence is written to encrypted local storage before any upload is attempted.
6. Cloud/R2/S3 reconciliation never deletes the only local copy.
7. Hashes are calculated before upload and verified before local retention cleanup.
8. Uploads are resumable and independently retryable from operational metadata sync.
9. Printing consumes an already-finalised ticket PDF; printing does not generate or mutate the ticket.
10. Development printing must be testable without owning a physical printer.

## 13.1 — Offline ticket identity — implemented first slice

Mobile SQLCipher schema version 6 introduces `local_ticket`.

A ticket contains:

- immutable UUIDv7 `ticket_id`
- immutable human `ticket_number`
- organisation, job and load identity
- issuing device identity
- source entity version
- immutable assignment snapshot captured at issue
- the sync event that projects `ticketNumber` onto the same Cloud load
- issue/create/update timestamps

### Numbering strategy

Mobile does **not** depend on a Cloud "next number" counter.

A Driver can only receive an assignment after Waste X has already created the job and load identity. The local ticket number is therefore derived deterministically from the cached job/load:

`{JOB_NUMBER}-L{LOAD_NUMBER}-{LOAD_UUID_PREFIX}`

Example:

`WX-20260905-11220C-L01-838BA857`

This gives the operator a recognisable reference while the UUIDv7 `ticket_id` remains the canonical immutable identity. If a load already has a ticket number from Cloud/Desktop, Mobile adopts that exact number rather than renumbering it.

The unique `load_id` constraint makes issue idempotent on a device: opening/retrying the action returns the same ticket instead of creating another ticket.

### Cloud reconciliation

New Mobile-issued ticket numbers reuse the existing local-first `LOAD_DETAILS_UPDATED` sync event. The local assignment is projected immediately and the event can remain queued offline. When connectivity returns the existing sync pipeline writes the same ticket number to `jobLoads.ticketNumber`.

A ticket record remains in SQLCipher even if Cloud queueing or upload is deferred.

## 13.2 — Offline PDF

Next slice:

- render the ticket from the immutable local ticket snapshot
- generate PDF bytes without Cloud
- store the generated PDF encrypted locally
- SHA-256 the final bytes
- retain generation timestamp and template version
- reopen/view after app restart and while offline
- never regenerate a different legal document silently after the ticket has been issued

## 13.3 — Signatures

Evidence roles:

- generator/site
- driver
- receiver

Each signature records:

- evidence UUID
- ticket/job/load IDs
- signer role
- captured timestamp
- optional signer display name
- optional GPS metadata
- SHA-256
- local encrypted object reference
- upload state

## 13.4 — Photographs & documents

Evidence types:

- field photograph
- external weighbridge ticket photograph
- attached document
- signature image
- generated ticket PDF

Camera/document acquisition must write locally first and remain viewable with no connectivity.

## 13.5 — Evidence upload

Large binary evidence upload is separate from operational metadata sync.

Lifecycle:

`LOCAL -> QUEUED -> UPLOADING -> UPLOADED -> VERIFIED`

Failure states remain retryable. Successful upload is not sufficient for deletion; the Cloud object/hash must be verified first.

## 13.6 — Desktop printer adapter

Desktop printing will use a printer adapter boundary:

- discover printers
- select/default printer
- submit PDF
- record printer/job/result metadata
- reprint exact same PDF/ticket

Development also exposes a **Waste X Test Printer**. It behaves like a discovered printer but writes the submitted PDF to a local test output directory and records the print event. This certifies discovery, selection, print, reprint, success/failure handling and audit events without physical hardware.

A later physical-printer smoke test is only required for OS driver behaviour, paper size, margins and actual device output.

## 13.7 — Retention

Local evidence is eligible for cleanup only when all are true:

- upload state is `VERIFIED`
- remote object exists
- remote metadata points to the same ticket/job/load
- local and remote SHA-256 agree
- configured retention period has elapsed
- no conflict, failure or legal hold is active

Pending, failed, conflicted or unverified evidence is never automatically deleted.
