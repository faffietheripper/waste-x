import { invoke } from "@tauri-apps/api/core";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type LocalJob = {
  id: string;
  jobNumber: string | null;
  jobDate: string | null;
  direction: string | null;
  status: string | null;
  entityVersion: number;
  pendingCreate: boolean;
  updatedAt: string;
};

type LocalLoad = {
  id: string;
  jobId: string;
  loadNumber: number | null;
  direction: string | null;
  status: string | null;
  entityVersion: number;
  ewcCode: string | null;
  wasteDescription: string | null;
  grossWeight: string | null;
  tareWeight: string | null;
  netWeight: string | null;
  weightMetric: string | null;
  ticketNumber: string | null;
  pendingChanges: number;
  updatedAt: string;
};

type LocalTicket = {
  id: string;
  jobLoadId: string;
  ticketNumber: string | null;
  status: string;
  issuedAt: string | null;
  hasPdf: boolean;
  byteLength: number | null;
  updatedAt: string;
};

type LocalEvidence = {
  id: string;
  jobLoadId: string | null;
  fileName: string;
  localPath: string | null;
  uploadStatus: string;
  createdAt: string;
  updatedAt: string;
};

type LocalEvent = {
  id: string;
  occurredAt: string;
  source: string;
  eventType: string;
  label: string;
  entityType: string;
  entityId: string;
  loadNumber: number | null;
  status: string | null;
  detail: string | null;
  payload: unknown;
};

type LocalCatalogue = {
  ok: true;
  query: string;
  offset: number;
  limit: number;
  totals: {
    jobs: number;
    loads: number;
    tickets: number;
    evidence: number;
  };
  jobs: LocalJob[];
  loads: LocalLoad[];
  tickets: LocalTicket[];
  evidence: LocalEvidence[];
  hasMoreJobs: boolean;
  nextOffset: number | null;
};

type LocalHistory = {
  ok: true;
  job: LocalJob;
  loads: LocalLoad[];
  tickets: LocalTicket[];
  evidence: LocalEvidence[];
  events: LocalEvent[];
  note: string;
};

function shortDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function shortDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function fileSize(bytes: number | null) {
  if (bytes === null) return "PDF cached";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadLabel(load: LocalLoad) {
  return `Load ${load.loadNumber ?? "—"}`;
}

export function RecordsPanel({
  cloudReachable,
}: {
  cloudReachable: boolean;
}) {
  const [query, setQuery] = useState("");
  const [catalogue, setCatalogue] = useState<LocalCatalogue | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<LocalHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory(jobId: string) {
    setHistoryBusy(true);
    setError(null);

    try {
      const result = await invoke<LocalHistory>(
        "desktop_local_job_history",
        { input: { jobId } },
      );
      setHistory(result);
    } catch (reason) {
      setHistory(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setHistoryBusy(false);
    }
  }

  async function loadRecords(
    nextQuery = query,
    offset = 0,
    preferredJobId: string | null = selectedJobId,
  ) {
    setBusy(true);
    setError(null);

    try {
      const result = await invoke<LocalCatalogue>("desktop_local_records", {
        input: {
          query: nextQuery,
          offset,
          limit: 50,
        },
      });

      setCatalogue(result);

      const nextSelected =
        preferredJobId &&
        result.jobs.some((job) => job.id === preferredJobId)
          ? preferredJobId
          : result.jobs[0]?.id ?? null;

      setSelectedJobId(nextSelected);

      if (nextSelected) {
        await loadHistory(nextSelected);
      } else {
        setHistory(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadRecords("", 0, null);
  }, []);

  const selectedJob = useMemo(
    () =>
      catalogue?.jobs.find((job) => job.id === selectedJobId) ??
      history?.job ??
      null,
    [catalogue, history, selectedJobId],
  );

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRecords(query, 0, null);
  }

  async function selectJob(jobId: string) {
    setSelectedJobId(jobId);
    await loadHistory(jobId);
  }

  return (
    <section className="local-records-panel">
      <div className="local-records-heading">
        <div>
          <span className="eyebrow">Encrypted local records</span>
          <h2>Records available with or without Cloud</h2>
          <p>
            Jobs, Loads, site tickets, locally-held evidence metadata and
            Desktop activity stored on this workstation remain searchable
            offline.
          </p>
        </div>

        <div className="local-records-state">
          <strong>Available offline</strong>
          <span>
            {cloudReachable
              ? "Cloud connected · local records remain the working copy"
              : "Working from encrypted SQLCipher records"}
          </span>
        </div>
      </div>

      <form className="local-records-search" onSubmit={search}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search local job number, status, direction, customer or reference…"
          aria-label="Search encrypted local records"
        />
        <button disabled={busy}>
          {busy ? "Searching…" : "Search records"}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void loadRecords(catalogue?.query ?? "", catalogue?.offset ?? 0)}
        >
          Refresh
        </button>
      </form>

      {error ? <div className="pilot-create-message">{error}</div> : null}

      {catalogue ? (
        <>
          <div className="local-records-totals">
            <span><strong>{catalogue.totals.jobs}</strong> local jobs</span>
            <span><strong>{catalogue.totals.loads}</strong> local loads</span>
            <span><strong>{catalogue.totals.tickets}</strong> site tickets</span>
            <span><strong>{catalogue.totals.evidence}</strong> local evidence items</span>
          </div>

          <div className="local-records-workspace">
            <section className="local-records-list">
              <div className="local-records-list-heading">
                <strong>Jobs on this Desktop</strong>
                <span>
                  Showing {catalogue.jobs.length}
                  {catalogue.query ? ` matching “${catalogue.query}”` : ""}
                </span>
              </div>

              <div className="local-records-job-list">
                {catalogue.jobs.map((job) => {
                  const jobLoads = catalogue.loads.filter(
                    (load) => load.jobId === job.id,
                  );
                  const pending = jobLoads.reduce(
                    (sum, load) => sum + load.pendingChanges,
                    0,
                  );

                  return (
                    <button
                      key={job.id}
                      type="button"
                      className={
                        selectedJobId === job.id
                          ? "local-record-job selected"
                          : "local-record-job"
                      }
                      onClick={() => void selectJob(job.id)}
                    >
                      <span>
                        <strong>{job.jobNumber ?? job.id}</strong>
                        {job.pendingCreate ? (
                          <em>Cloud create pending</em>
                        ) : null}
                      </span>
                      <span>
                        {job.direction ?? "—"} · {job.status ?? "—"} ·{" "}
                        {shortDate(job.jobDate)}
                      </span>
                      <small>
                        {jobLoads.length} {jobLoads.length === 1 ? "load" : "loads"}
                        {pending > 0
                          ? ` · ${pending} local change${pending === 1 ? "" : "s"} queued`
                          : ""}
                      </small>
                    </button>
                  );
                })}

                {!catalogue.jobs.length ? (
                  <div className="empty-state">
                    No encrypted local Jobs matched this search.
                  </div>
                ) : null}
              </div>

              <div className="cloud-page-actions">
                <button
                  className="secondary-button"
                  disabled={busy || catalogue.offset === 0}
                  onClick={() =>
                    void loadRecords(
                      catalogue.query,
                      Math.max(0, catalogue.offset - catalogue.limit),
                      null,
                    )
                  }
                >
                  Previous
                </button>
                <button
                  className="secondary-button"
                  disabled={
                    busy ||
                    !catalogue.hasMoreJobs ||
                    catalogue.nextOffset === null
                  }
                  onClick={() =>
                    void loadRecords(
                      catalogue.query,
                      catalogue.nextOffset ?? 0,
                      null,
                    )
                  }
                >
                  Next
                </button>
              </div>
            </section>

            <section className="local-records-detail">
              {historyBusy && !history ? (
                <div className="empty-state">Loading encrypted Job history…</div>
              ) : history && selectedJob ? (
                <>
                  <div className="local-record-detail-heading">
                    <div>
                      <span className="eyebrow">Local Job record</span>
                      <h3>{selectedJob.jobNumber ?? selectedJob.id}</h3>
                      <p>
                        {selectedJob.direction ?? "—"} ·{" "}
                        {selectedJob.status ?? "—"} ·{" "}
                        {shortDate(selectedJob.jobDate)}
                      </p>
                    </div>
                    <span
                      className={
                        selectedJob.pendingCreate
                          ? "local-record-sync pending"
                          : "local-record-sync"
                      }
                    >
                      {selectedJob.pendingCreate
                        ? "Cloud create pending"
                        : `Local version ${selectedJob.entityVersion}`}
                    </span>
                  </div>

                  <p className="local-record-note">{history.note}</p>

                  <div className="local-record-section">
                    <h4>Loads</h4>
                    <div className="local-record-loads">
                      {history.loads.map((load) => (
                        <article key={load.id}>
                          <div>
                            <strong>{loadLabel(load)}</strong>
                            <span>{load.status ?? "—"}</span>
                          </div>
                          <p>
                            {load.ewcCode ?? "EWC —"} ·{" "}
                            {load.wasteDescription ?? "Waste description unavailable"}
                          </p>
                          <small>
                            {load.netWeight
                              ? `Net ${load.netWeight} ${load.weightMetric ?? ""}`
                              : "Weight not completed"}
                            {load.ticketNumber
                              ? ` · Ticket ${load.ticketNumber}`
                              : ""}
                            {load.pendingChanges > 0
                              ? ` · ${load.pendingChanges} queued change${load.pendingChanges === 1 ? "" : "s"}`
                              : ""}
                          </small>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="local-record-grid">
                    <div className="local-record-section">
                      <h4>Receiving-site tickets</h4>
                      {history.tickets.length ? (
                        history.tickets.map((ticket) => (
                          <article className="local-record-mini" key={ticket.id}>
                            <strong>{ticket.ticketNumber ?? "Local ticket"}</strong>
                            <span>
                              {ticket.status} ·{" "}
                              {ticket.hasPdf ? fileSize(ticket.byteLength) : "PDF not cached"}
                            </span>
                            <small>{shortDateTime(ticket.issuedAt ?? ticket.updatedAt)}</small>
                          </article>
                        ))
                      ) : (
                        <div className="empty-state compact">
                          No receiving-site ticket has been issued locally.
                        </div>
                      )}
                    </div>

                    <div className="local-record-section">
                      <h4>Local evidence</h4>
                      {history.evidence.length ? (
                        history.evidence.map((item) => (
                          <article className="local-record-mini" key={item.id}>
                            <strong>{item.fileName}</strong>
                            <span>{item.uploadStatus}</span>
                            <small>{shortDateTime(item.createdAt)}</small>
                          </article>
                        ))
                      ) : (
                        <div className="empty-state compact">
                          No evidence metadata is stored locally for this Job.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="local-record-section">
                    <h4>Desktop activity</h4>
                    <div className="local-record-timeline">
                      {history.events.map((event) => (
                        <article key={event.id}>
                          <span className="local-record-timeline-dot" />
                          <div>
                            <strong>{event.label}</strong>
                            <span>
                              {event.source}
                              {event.loadNumber !== null
                                ? ` · Load ${event.loadNumber}`
                                : ""}
                              {event.status ? ` · ${event.status}` : ""}
                            </span>
                            {event.detail ? <small>{event.detail}</small> : null}
                          </div>
                          <time>{shortDateTime(event.occurredAt)}</time>
                        </article>
                      ))}

                      {!history.events.length ? (
                        <div className="empty-state compact">
                          No local activity events are stored for this Job yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  Select a local Job to inspect its encrypted record.
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="empty-state">
          {busy ? "Loading encrypted records…" : "Local records are unavailable."}
        </div>
      )}

      <div className="local-records-boundary">
        <strong>
          {cloudReachable
            ? "Cloud archive is connected below."
            : "Whole-account Cloud archive is temporarily unavailable."}
        </strong>
        <span>
          This section contains records already held by this authorised Desktop.
          Records that have never been downloaded to this workstation require
          Cloud connectivity.
        </span>
      </div>
    </section>
  );
}
