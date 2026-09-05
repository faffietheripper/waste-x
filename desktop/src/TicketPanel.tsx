import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type DesktopTicketState = {
  loadId: string;
  jobId: string;
  ticketId: string | null;
  ticketNumber: string | null;
  authority: "MANAGEMENT_SITE";
  fieldWorkflowStep: string | null;
  canIssue: boolean;
  blockReason: string | null;
  issuedAt: string | null;
  sourceEntityVersion: number | null;
  pdfGenerated: boolean;
  pdfSha256: string | null;
  pdfByteLength: number | null;
  syncState: string | null;
};

function fileSize(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TicketPanel({
  loadId,
  disabled,
  onChanged,
}: {
  loadId: string;
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [ticket, setTicket] = useState<DesktopTicketState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const next = await invoke<DesktopTicketState>("desktop_ticket_status", {
      input: { loadId },
    });
    setTicket(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void invoke<DesktopTicketState>("desktop_ticket_status", {
      input: { loadId },
    })
      .then((next) => {
        if (!cancelled) {
          setTicket(next);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [loadId]);

  async function issueTicket() {
    setBusy(true);
    setError(null);
    try {
      const issued = await invoke<DesktopTicketState>("desktop_issue_ticket", {
        input: { loadId },
      });
      setTicket(issued);
      await onChanged();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ticket-authority-panel">
      <div className="ticket-authority-heading">
        <div>
          <span className="eyebrow">Stage 13 · Management-site ticket</span>
          <h3>Site authority only</h3>
          <p className="small-copy">
            The Driver confirms delivery. This Desktop verifies the local delivered state,
            final site data and weight before it can issue the canonical Waste X ticket.
          </p>
        </div>
        <span className={`status-pill ${ticket?.ticketNumber ? "status-completed" : "status-planned"}`}>
          {ticket?.ticketNumber ? "issued" : "not issued"}
        </span>
      </div>

      {error ? <div className="ticket-error">{error}</div> : null}

      {ticket?.ticketNumber ? (
        <div className="ticket-issued-card">
          <span>WASTE X TICKET</span>
          <strong>{ticket.ticketNumber}</strong>
          <div className="ticket-proof-grid">
            <span><b>Authority</b> Management / site</span>
            <span><b>Driver state</b> {ticket.fieldWorkflowStep ?? "—"}</span>
            <span><b>Issued</b> {ticket.issuedAt ? new Date(ticket.issuedAt).toLocaleString() : "—"}</span>
            <span><b>Sync</b> {ticket.syncState ?? "Local only"}</span>
            <span><b>PDF</b> {ticket.pdfGenerated ? `Encrypted · ${fileSize(ticket.pdfByteLength)}` : "Pending"}</span>
          </div>
          {ticket.pdfSha256 ? (
            <div className="ticket-hash">
              <span>PDF SHA-256</span>
              <code>{ticket.pdfSha256}</code>
            </div>
          ) : null}
          <p className="small-copy">
            Print and reprint will consume these exact stored PDF bytes. Reprinting must never
            change the ticket number or SHA-256.
          </p>
        </div>
      ) : (
        <div className="ticket-waiting-card">
          <div className="ticket-proof-grid">
            <span><b>Driver field state</b> {ticket?.fieldWorkflowStep ?? "Not received"}</span>
            <span><b>Cloud required</b> No</span>
            <span><b>Issuer</b> Management / site Desktop</span>
          </div>
          <p>{ticket?.blockReason ?? "Checking ticket eligibility…"}</p>
          <button
            disabled={disabled || busy || !ticket?.canIssue}
            onClick={() => void issueTicket()}
            type="button"
          >
            {busy ? "Issuing locally…" : "Issue site ticket + offline PDF"}
          </button>
        </div>
      )}
    </section>
  );
}
