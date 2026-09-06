import { useEffect, useState } from "react";

export type SiteRejectionCategory =
  | "WASTE_MISMATCH"
  | "CONTAMINATION"
  | "PERMIT_OR_COMPLIANCE"
  | "UNSAFE_LOAD"
  | "DOCUMENTATION"
  | "SITE_CAPACITY"
  | "OTHER";

const CATEGORIES: Array<{ value: SiteRejectionCategory; label: string }> = [
  { value: "WASTE_MISMATCH", label: "Waste does not match booking" },
  { value: "CONTAMINATION", label: "Contamination / unacceptable material" },
  { value: "PERMIT_OR_COMPLIANCE", label: "Permit / compliance issue" },
  { value: "UNSAFE_LOAD", label: "Unsafe load" },
  { value: "DOCUMENTATION", label: "Missing / incorrect paperwork" },
  { value: "SITE_CAPACITY", label: "Site cannot receive this load" },
  { value: "OTHER", label: "Other" },
];

export function RejectLoadModal({
  open,
  jobNumber,
  loadNumber,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  jobNumber: string;
  loadNumber: number | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (category: SiteRejectionCategory, reason: string) => Promise<boolean>;
}) {
  const [category, setCategory] = useState<SiteRejectionCategory | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCategory("");
      setReason("");
      setError(null);
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function submit() {
    if (!category) {
      setError("Choose a rejection category.");
      return;
    }
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setError("Enter a clear rejection reason.");
      return;
    }
    setError(null);
    const accepted = await onConfirm(category, cleanReason);
    if (accepted) onClose();
  }

  return (
    <div
      className="site-reject-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="site-reject-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-reject-title"
      >
        <div className="site-reject-modal-head">
          <div>
            <span className="eyebrow">Receiving-site decision</span>
            <h3 id="site-reject-title">
              Reject {jobNumber} · Load {loadNumber ?? "—"}
            </h3>
            <p>
              Refuse this load at the receiving site and record why. The Driver will receive the rejection as a read-only result after sync.
            </p>
          </div>
          <button
            className="site-reject-close"
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close rejection dialog"
          >
            ×
          </button>
        </div>

        <div className="site-reject-modal-body">
          <label>
            <span>Rejection category</span>
            <select
              disabled={busy}
              value={category}
              onChange={(event) => setCategory(event.target.value as SiteRejectionCategory | "")}
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span>What was refused and why?</span>
            <textarea
              disabled={busy}
              rows={5}
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Load contains material that does not match the booking and cannot be accepted at this site."
            />
          </label>

          {error ? <div className="site-reject-error">{error}</div> : null}

          <div className="site-reject-warning">
            This is a terminal receiving-site refusal. Waste X keeps the reason in the operational record and does not create a normal completed-load ticket.
          </div>

          <div className="site-reject-actions">
            <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
              Keep load open
            </button>
            <button className="danger-button" type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "Rejecting locally…" : "Confirm rejection"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
