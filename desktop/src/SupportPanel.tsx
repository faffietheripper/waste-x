import { invoke } from "@tauri-apps/api/core";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type TicketCategory = "bug" | "billing" | "access" | "feature_request" | "compliance" | "other";
type TicketPriority = "low" | "medium" | "high" | "urgent";
type TicketStatus = "open" | "in_progress" | "waiting_on_user" | "resolved" | "closed";

type SupportMessage = {
  id: string;
  ticketId: string;
  senderUserId: string;
  senderName: string | null;
  senderRole: string | null;
  authorKind: "support" | "customer";
  message: string;
  createdAt: string | null;
  syncState?: "pending" | "failed" | null;
};

type SupportTicket = {
  id: string;
  createdByUserId: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedToUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  messages: SupportMessage[];
};

type SupportData = {
  ok?: boolean;
  viewer: { userId: string };
  tickets: SupportTicket[];
  pendingCount: number;
  failedCount: number;
  syncWarning?: string;
};

type SupportMutationResponse = { ok: boolean; ticketId: string; data: SupportData };

const categoryOptions: Array<{ value: TicketCategory; label: string }> = [
  { value: "bug", label: "Bug / technical issue" },
  { value: "access", label: "Access / account" },
  { value: "compliance", label: "Compliance" },
  { value: "billing", label: "Billing" },
  { value: "feature_request", label: "Feature request" },
  { value: "other", label: "Other" },
];
const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function shortDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function shortTicketId(id: string) {
  return id.length > 10 ? `#${id.slice(0, 8)}` : `#${id}`;
}
function latestMessage(ticket: SupportTicket) {
  return ticket.messages[ticket.messages.length - 1]?.message ?? "No messages yet.";
}

function ticketSyncState(ticket: SupportTicket): "pending" | "failed" | null {
  if (ticket.messages.some((message) => message.syncState === "failed")) return "failed";
  if (ticket.messages.some((message) => message.syncState === "pending")) return "pending";
  return null;
}

export function SupportPanel({ cloudReachable }: { cloudReachable: boolean }) {
  const [data, setData] = useState<SupportData | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [category, setCategory] = useState<TicketCategory>("bug");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [newMessage, setNewMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");

  const tickets = data?.tickets ?? [];
  const visibleTickets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tickets;
    return tickets.filter((ticket) =>
      [ticket.id, ticket.category, ticket.priority, ticket.status, latestMessage(ticket)]
        .join(" ").toLowerCase().includes(needle),
    );
  }, [query, tickets]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const terminal = selectedTicket?.status === "resolved" || selectedTicket?.status === "closed";

  function applyData(result: SupportData, preferredTicketId?: string | null) {
    setData(result);
    const desired =
      preferredTicketId && result.tickets.some((ticket) => ticket.id === preferredTicketId)
        ? preferredTicketId
        : selectedTicketId && result.tickets.some((ticket) => ticket.id === selectedTicketId)
          ? selectedTicketId
          : result.tickets[0]?.id ?? null;
    setSelectedTicketId(desired);
    if (result.syncWarning) setError(result.syncWarning);
  }

  async function loadLocal(preferredTicketId?: string | null) {
    const result = await invoke<SupportData>("desktop_support_tickets");
    applyData(result, preferredTicketId);
    return result;
  }

  async function syncSupport(preferredTicketId?: string | null) {
    if (!cloudReachable) return loadLocal(preferredTicketId);
    const result = await invoke<SupportData>("desktop_sync_support");
    applyData(result, preferredTicketId);
    return result;
  }

  async function refreshSupport(preferredTicketId?: string | null) {
    setBusy(true);
    setError("");
    try {
      await loadLocal(preferredTicketId);
      if (cloudReachable) await syncSupport(preferredTicketId);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshSupport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReachable]);

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = newMessage.trim();
    if (message.length < 10) {
      setError("Please describe the issue in at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await invoke<SupportMutationResponse>("desktop_mutate_support", {
        input: { operation: "ticket.create", data: { category, priority, message } },
      });
      applyData(result.data, result.ticketId);
      setNewMessage("");
      setCategory("bug");
      setPriority("medium");
      setShowNewTicket(false);
      if (cloudReachable) await syncSupport(result.ticketId);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    const message = replyMessage.trim();
    if (!message) return;
    setBusy(true);
    setError("");
    try {
      const result = await invoke<SupportMutationResponse>("desktop_mutate_support", {
        input: { operation: "ticket.reply", data: { ticketId: selectedTicket.id, message } },
      });
      applyData(result.data, result.ticketId);
      setReplyMessage("");
      if (cloudReachable) await syncSupport(result.ticketId);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pilot-screen pilot-scroll-screen pilot-support-screen">
      <div className="pilot-page-heading pilot-support-heading">
        <div>
          <span className="eyebrow">Waste X helpdesk</span>
          <h1>Support</h1>
          <p>Create and follow the same organisation support tickets used by the Waste X Web app.</p>
        </div>
        <div className="pilot-support-heading-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void refreshSupport(selectedTicketId)}>
            {busy ? "Working…" : cloudReachable ? "Sync support" : "Refresh local"}
          </button>
          <button type="button" disabled={busy} onClick={() => setShowNewTicket((value) => !value)}>
            {showNewTicket ? "Cancel" : "+ New ticket"}
          </button>
        </div>
      </div>

      {data && (data.pendingCount > 0 || data.failedCount > 0) ? (
        <div className="pilot-support-queue-note">
          <div>
            <strong>{data.pendingCount} queued · {data.failedCount} retry / review</strong>
            <span>Local support changes remain on this Desktop until Cloud confirms them.</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="pilot-action-toast error" role="alert" aria-live="assertive">
          <div><strong>Action unsuccessful</strong><span>{error}</span></div>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button>
        </div>
      ) : null}

      {showNewTicket ? (
        <form className="pilot-support-new" onSubmit={createTicket}>
          <div className="pilot-support-new-heading">
            <div><span className="eyebrow">New ticket</span><h2>Tell Waste X Support what you need</h2></div>
            <small>{cloudReachable ? "Saved locally first, then synced to the Web helpdesk." : "Saved locally now and queued for Cloud sync."}</small>
          </div>
          <div className="pilot-support-new-grid">
            <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)}>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="wide"><span>Message</span><textarea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} placeholder="Describe the issue, what you were doing and what you expected to happen…" rows={4} /></label>
          </div>
          <div className="pilot-support-form-actions"><span>{newMessage.trim().length}/5000</span><button disabled={busy || newMessage.trim().length < 10 || newMessage.trim().length > 5000}>{busy ? "Saving…" : "Create ticket"}</button></div>
        </form>
      ) : null}

      <div className="pilot-support-layout">
        <section className="pilot-support-list-panel">
          <div className="pilot-support-list-heading"><div><span className="eyebrow">My tickets</span><h2>{tickets.length} total</h2></div>{data?.pendingCount ? <span className="pilot-support-local-badge">{data.pendingCount} queued</span> : null}</div>
          <div className="pilot-support-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticket, status, category or message…" />{query ? <button type="button" onClick={() => setQuery("")}>Clear</button> : null}</div>
          <div className="pilot-support-ticket-list">
            {visibleTickets.map((ticket) => (
              <button type="button" key={ticket.id} className={`pilot-support-ticket ${selectedTicketId === ticket.id ? "active" : ""}`} onClick={() => setSelectedTicketId(ticket.id)}>
                <div className="pilot-support-ticket-top"><strong>{shortTicketId(ticket.id)}</strong><span className="pilot-support-status" data-status={ticket.status}>{label(ticket.status)}</span></div>
                <span>{label(ticket.category)} · {label(ticket.priority)}</span><p>{latestMessage(ticket)}</p><small>{ticketSyncState(ticket) === "pending" ? "Queued for sync · " : ticketSyncState(ticket) === "failed" ? "Needs review · " : ""}Updated {shortDateTime(ticket.updatedAt ?? ticket.createdAt)}</small>
              </button>
            ))}
            {!busy && !visibleTickets.length ? <div className="empty-state">{tickets.length ? "No support tickets matched your search." : "No support tickets yet. You can create one even while offline."}</div> : null}
          </div>
        </section>

        <section className="pilot-support-thread-panel">
          {selectedTicket && data ? (
            <>
              <div className="pilot-support-thread-heading"><div><span className="eyebrow">{shortTicketId(selectedTicket.id)}</span><h2>{label(selectedTicket.category)}</h2><p>{label(selectedTicket.priority)} priority · {selectedTicket.assignedToUserId ? "Assigned to Waste X Support" : "Awaiting support assignment"}</p></div><span className="pilot-support-status" data-status={selectedTicket.status}>{label(selectedTicket.status)}</span></div>
              <div className="pilot-support-thread">
                {selectedTicket.messages.map((message) => {
                  const mine = message.senderUserId === data.viewer.userId;
                  const support = message.authorKind === "support";
                  return <article key={message.id} className={`pilot-support-message ${mine ? "mine" : support ? "support" : "customer"}`}><div><strong>{mine ? "You" : support ? "Waste X Support" : message.senderName ?? "Organisation user"}</strong><span>{shortDateTime(message.createdAt)}{message.syncState === "pending" ? " · queued" : message.syncState === "failed" ? " · retry/review" : ""}</span></div><p>{message.message}</p></article>;
                })}
              </div>
              {terminal ? <div className="pilot-support-terminal"><strong>This ticket is {selectedTicket.status}.</strong><span>Create a new ticket if you need further help with this issue.</span></div> : (
                <form className="pilot-support-reply" onSubmit={sendReply}>
                  <label><span>Reply</span><textarea rows={3} value={replyMessage} onChange={(event) => setReplyMessage(event.target.value)} placeholder="Write a reply to Waste X Support…" /></label>
                  <div><small>{replyMessage.trim().length}/5000 · {cloudReachable ? "Saved locally first and synced to Cloud." : "Offline replies are encrypted and queued automatically."}</small><button disabled={busy || !replyMessage.trim() || replyMessage.trim().length > 5000}>{busy ? "Saving…" : "Send reply"}</button></div>
                </form>
              )}
            </>
          ) : <div className="empty-state">{busy ? "Loading support tickets…" : "Select a ticket to open the conversation."}</div>}
        </section>
      </div>
    </section>
  );
}
