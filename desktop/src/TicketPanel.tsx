import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type DesktopTicketState = {
  loadId: string;
  jobId: string;
  ticketId: string | null;
  ticketNumber: string | null;
  authority: "RECEIVING_SITE";
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
          <span className="eyebrow">Stage 13 · Receiving-site ticket</span>
          <h3>Final site document</h3>
          <p className="small-copy">
            This ticket belongs to the completed receiving-site transaction. It is created from
            the site's final waste and weight record, then stored as an immutable PDF for print,
            reprint and digital delivery.
          </p>
        </div>
        <span className={`status-pill ${ticket?.ticketNumber ? "status-completed" : "status-planned"}`}>
          {ticket?.ticketNumber ? "issued" : "ready"}
        </span>
      </div>

      {error ? <div className="ticket-error">{error}</div> : null}

      {ticket?.ticketNumber ? (
        <div className="ticket-issued-card">
          <span>RECEIVING-SITE TICKET</span>
          <strong>{ticket.ticketNumber}</strong>
          <div className="ticket-proof-grid">
            <span><b>Authority</b> Receiving site</span>
            <span><b>Driver arrival</b> {ticket.fieldWorkflowStep ?? "Not recorded"}</span>
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
            Print and reprint consume these exact stored PDF bytes. A reprint never creates a new
            ticket number or changes the SHA-256.
          </p>
        </div>
      ) : (
        <div className="ticket-waiting-card">
          <div className="ticket-proof-grid">
            <span><b>Load transaction</b> Completed</span>
            <span><b>Cloud required</b> No</span>
            <span><b>Issuer</b> Receiving site / Desktop</span>
          </div>
          {ticket?.blockReason ? <p>{ticket.blockReason}</p> : null}
          <button
            disabled={disabled || busy || !ticket?.canIssue}
            onClick={() => void issueTicket()}
            type="button"
          >
            {busy ? "Generating locally…" : "Generate site ticket + offline PDF"}
          </button>
        </div>
      )}
    </section>
  );
}
