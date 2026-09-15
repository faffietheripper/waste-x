import { invoke } from "@tauri-apps/api/core";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

export type PartnerManageTab = "hauliers" | "sites";

type Company = {
  id: string;
  name: string;
  accountReference: string | null;
  carrierRegistrationNumber: string | null;
  email: string | null;
  telephone: string | null;
  fullAddress: string | null;
  postcode: string | null;
  notes: string | null;
  isActive: boolean;
  roles: string[];
};

type Site = {
  id: string;
  counterpartyId: string;
  companyName: string;
  name: string;
  siteType: "producer_site" | "third_party_tip";
  kind: "source" | "destination";
  fullAddress: string | null;
  postcode: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactTelephone: string | null;
  authorisationNumber: string | null;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
  hasActiveAuthorisation: boolean;
  authorisationNumbers: string[];
};

type PartnerData = {
  ok: true;
  hauliers: Company[];
  sourceCompanies: Company[];
  destinationCompanies: Company[];
  sites: Site[];
  boundary: {
    destinationAuthorisations: "WEB_ONLY";
    permittedEwcConfiguration: "WEB_ONLY";
    advancedCounterpartyCompliance: "WEB_ONLY";
  };
};

type MutationResult = {
  ok: true;
  action: "created" | "updated" | "archived" | "restored";
  entityType: "haulier" | "company" | "site";
  entityId: string;
  syncFeedWarning: boolean;
  data: Omit<PartnerData, "ok" | "boundary">;
};

type HaulierDraft = {
  id: string | null;
  name: string;
  carrierRegistrationNumber: string;
  email: string;
  telephone: string;
  fullAddress: string;
  postcode: string;
  notes: string;
};

type SiteDraft = {
  id: string | null;
  kind: "source" | "destination";
  counterpartyId: string;
  name: string;
  fullAddress: string;
  postcode: string;
  contactName: string;
  contactEmail: string;
  contactTelephone: string;
  notes: string;
};

type CompanyDraft = {
  kind: "source" | "destination";
  name: string;
  accountReference: string;
  email: string;
  telephone: string;
  fullAddress: string;
  postcode: string;
  notes: string;
};

const EMPTY_HAULIER: HaulierDraft = {
  id: null,
  name: "",
  carrierRegistrationNumber: "",
  email: "",
  telephone: "",
  fullAddress: "",
  postcode: "",
  notes: "",
};

const EMPTY_SITE: SiteDraft = {
  id: null,
  kind: "source",
  counterpartyId: "",
  name: "",
  fullAddress: "",
  postcode: "",
  contactName: "",
  contactEmail: "",
  contactTelephone: "",
  notes: "",
};

const EMPTY_COMPANY: CompanyDraft = {
  kind: "source",
  name: "",
  accountReference: "",
  email: "",
  telephone: "",
  fullAddress: "",
  postcode: "",
  notes: "",
};

function optional(value: string) {
  const clean = value.trim();
  return clean ? clean : null;
}

export function ManagePartnersPanel({
  tab,
  cloudReachable,
  onMasterDataChanged,
}: {
  tab: PartnerManageTab;
  cloudReachable: boolean;
  onMasterDataChanged: () => Promise<void> | void;
}) {
  const [data, setData] = useState<PartnerData | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedHaulierId, setSelectedHaulierId] =
    useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] =
    useState<string | null>(null);
  const [haulierDraft, setHaulierDraft] =
    useState<HaulierDraft>(EMPTY_HAULIER);
  const [siteDraft, setSiteDraft] =
    useState<SiteDraft>(EMPTY_SITE);
  const [companyDraft, setCompanyDraft] =
    useState<CompanyDraft>(EMPTY_COMPANY);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* WASTE_X_DESKTOP_PARTNER_ACTION_TOAST_V1 */
  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      setData(
        await invoke<PartnerData>("desktop_partner_master_data"),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [cloudReachable]);

  useEffect(() => {
    setQuery("");
    setMessage(null);
    setError(null);
  }, [tab]);

  const visibleHauliers = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (data?.hauliers ?? []).filter((haulier) => {
      if (!showArchived && !haulier.isActive) return false;
      if (!needle) return true;

      return [
        haulier.name,
        haulier.carrierRegistrationNumber,
        haulier.email,
        haulier.telephone,
        haulier.postcode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data?.hauliers, query, showArchived]);

  const visibleSites = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (data?.sites ?? []).filter((site) => {
      if (!showArchived && !site.isActive) return false;
      if (!needle) return true;

      return [
        site.name,
        site.companyName,
        site.kind,
        site.postcode,
        site.fullAddress,
        site.contactName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data?.sites, query, showArchived]);

  const siteCompanies =
    siteDraft.kind === "source"
      ? data?.sourceCompanies ?? []
      : data?.destinationCompanies ?? [];

  const selectedHaulier =
    data?.hauliers.find(
      (haulier) => haulier.id === selectedHaulierId,
    ) ?? null;

  const selectedSite =
    data?.sites.find((site) => site.id === selectedSiteId) ?? null;

  function beginHaulier(haulier?: Company) {
    setMessage(null);
    setError(null);

    if (!haulier) {
      setSelectedHaulierId(null);
      setHaulierDraft(EMPTY_HAULIER);
      return;
    }

    setSelectedHaulierId(haulier.id);
    setHaulierDraft({
      id: haulier.id,
      name: haulier.name,
      carrierRegistrationNumber:
        haulier.carrierRegistrationNumber ?? "",
      email: haulier.email ?? "",
      telephone: haulier.telephone ?? "",
      fullAddress: haulier.fullAddress ?? "",
      postcode: haulier.postcode ?? "",
      notes: haulier.notes ?? "",
    });
  }

  function beginSite(site?: Site) {
    setMessage(null);
    setError(null);
    setShowCompanyForm(false);

    if (!site) {
      setSelectedSiteId(null);
      setSiteDraft(EMPTY_SITE);
      return;
    }

    setSelectedSiteId(site.id);
    setSiteDraft({
      id: site.id,
      kind: site.kind,
      counterpartyId: site.counterpartyId,
      name: site.name,
      fullAddress: site.fullAddress ?? "",
      postcode: site.postcode ?? "",
      contactName: site.contactName ?? "",
      contactEmail: site.contactEmail ?? "",
      contactTelephone: site.contactTelephone ?? "",
      notes: site.notes ?? "",
    });
  }

  async function mutate(input: unknown) {
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const result = await invoke<MutationResult>(
        "desktop_mutate_partner_local",
        { input },
      );

      setData((current) =>
        current
          ? { ...current, ...result.data }
          : null,
      );

      if (cloudReachable) {
        try {
          await invoke("desktop_sync_partner_mutations");
        } catch {
          // The local Partner / Site change is durable and retries automatically.
        }
      }
      await onMasterDataChanged();

      setMessage(
        `${result.entityType} ${result.action}.${
          result.syncFeedWarning
            ? " Local data refreshed; Cloud change-feed publication needs review."
            : ""
        }`,
      );

      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveHaulier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = await mutate({
      operation: haulierDraft.id
        ? "haulier.update"
        : "haulier.create",
      data: {
        id: haulierDraft.id ?? crypto.randomUUID(),
        name: haulierDraft.name,
        carrierRegistrationNumber: optional(
          haulierDraft.carrierRegistrationNumber,
        ),
        email: optional(haulierDraft.email),
        telephone: optional(haulierDraft.telephone),
        fullAddress: optional(haulierDraft.fullAddress),
        postcode: optional(haulierDraft.postcode),
        notes: optional(haulierDraft.notes),
      },
    });

    if (result) {
      const haulier = result.data.hauliers.find(
        (item) => item.id === result.entityId,
      );
      if (haulier) beginHaulier(haulier);
    }
  }

  async function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = await mutate({
      operation: siteDraft.id ? "site.update" : "site.create",
      data: {
        id: siteDraft.id ?? crypto.randomUUID(),
        kind: siteDraft.kind,
        counterpartyId: siteDraft.counterpartyId,
        name: siteDraft.name,
        fullAddress: optional(siteDraft.fullAddress),
        postcode: optional(siteDraft.postcode),
        contactName: optional(siteDraft.contactName),
        contactEmail: optional(siteDraft.contactEmail),
        contactTelephone: optional(siteDraft.contactTelephone),
        notes: optional(siteDraft.notes),
      },
    });

    if (result) {
      const site = result.data.sites.find(
        (item) => item.id === result.entityId,
      );
      if (site) beginSite(site);
    }
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = await mutate({
      operation: "company.create",
      data: {
        id: crypto.randomUUID(),
        kind: companyDraft.kind,
        name: companyDraft.name,
        accountReference: optional(companyDraft.accountReference),
        email: optional(companyDraft.email),
        telephone: optional(companyDraft.telephone),
        fullAddress: optional(companyDraft.fullAddress),
        postcode: optional(companyDraft.postcode),
        notes: optional(companyDraft.notes),
      },
    });

    if (result) {
      setCompanyDraft(EMPTY_COMPANY);
      setShowCompanyForm(false);

      const companies =
        siteDraft.kind === "source"
          ? result.data.sourceCompanies
          : result.data.destinationCompanies;

      const company = companies.find(
        (item) => item.id === result.entityId,
      );

      if (company) {
        setSiteDraft((current) => ({
          ...current,
          counterpartyId: company.id,
        }));
      }
    }
  }

  if (loading && !data) {
    return <div className="empty-state">Loading partner records…</div>;
  }

  if (!data) {
    return error ? (
      <div className="pilot-manage-message bad">{error}</div>
    ) : null;
  }

  return (
    <div className="pilot-partners-wrap">
      {message ? (
        <div className="pilot-action-toast success" role="status" aria-live="polite">
          <div>
            <strong>Action completed</strong>
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="pilot-action-toast error" role="alert" aria-live="assertive">
          <div>
            <strong>Action unsuccessful</strong>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      ) : null}

      {tab === "hauliers" ? (
        <div className="pilot-manage-layout">
          <section className="pilot-manage-list">
            <div className="pilot-manage-toolbar">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search haulier, carrier number, contact or postcode…"
              />

              <label>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) =>
                    setShowArchived(event.target.checked)
                  }
                />
                Show archived
              </label>

              <button type="button" onClick={() => beginHaulier()}>
                + Add Haulier
              </button>
            </div>

            <div className="pilot-manage-table-head">
              <span>Haulier</span>
              <span>Carrier details</span>
              <span>Status</span>
            </div>

            <div className="pilot-manage-rows">
              {visibleHauliers.map((haulier) => (
                <button
                  type="button"
                  key={haulier.id}
                  className={
                    selectedHaulierId === haulier.id ? "active" : ""
                  }
                  onClick={() => beginHaulier(haulier)}
                >
                  <span>
                    <strong>{haulier.name}</strong>
                    <small>
                      {[haulier.email, haulier.telephone]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"}
                    </small>
                  </span>

                  <span>
                    <strong>
                      {haulier.carrierRegistrationNumber ??
                        "Carrier number not set"}
                    </strong>
                    <small>{haulier.postcode ?? "No postcode"}</small>
                  </span>

                  <span>
                    <b
                      className={
                        haulier.isActive
                          ? "pilot-state-active"
                          : "pilot-state-archived"
                      }
                    >
                      {haulier.isActive ? "Active" : "Archived"}
                    </b>
                  </span>
                </button>
              ))}

              {!visibleHauliers.length ? (
                <div className="empty-state">
                  No hauliers match this view.
                </div>
              ) : null}
            </div>
          </section>

          <section className="pilot-manage-editor">
            <form onSubmit={saveHaulier}>
              <div className="pilot-manage-editor-heading">
                <div>
                  <span className="eyebrow">Haulier record</span>
                  <h2>
                    {haulierDraft.id
                      ? selectedHaulier?.name ?? "Haulier"
                      : "Add Haulier"}
                  </h2>
                </div>

                {selectedHaulier ? (
                  <span
                    className={
                      selectedHaulier.isActive
                        ? "pilot-state-active"
                        : "pilot-state-archived"
                    }
                  >
                    {selectedHaulier.isActive
                      ? "Active"
                      : "Archived"}
                  </span>
                ) : null}
              </div>

              <div className="pilot-manage-form">
                <label className="wide">
                  <span>Company name</span>
                  <input
                    value={haulierDraft.name}
                    onChange={(event) =>
                      setHaulierDraft({
                        ...haulierDraft,
                        name: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label className="wide">
                  <span>Waste carrier registration</span>
                  <input
                    value={haulierDraft.carrierRegistrationNumber}
                    onChange={(event) =>
                      setHaulierDraft({
                        ...haulierDraft,
                        carrierRegistrationNumber: event.target.value,
                      })
                    }
                    placeholder="CBDU123456"
                  />
                </label>

                <label>
                  <span>Telephone</span>
                  <input
                    value={haulierDraft.telephone}
                    onChange={(event) =>
                      setHaulierDraft({
                        ...haulierDraft,
                        telephone: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={haulierDraft.email}
                    onChange={(event) =>
                      setHaulierDraft({
                        ...haulierDraft,
                        email: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="wide">
                  <span>Address</span>
                  <input
                    value={haulierDraft.fullAddress}
                    onChange={(event) =>
                      setHaulierDraft({
                        ...haulierDraft,
                        fullAddress: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="wide">
                  <span>Postcode</span>
                  <input
                    value={haulierDraft.postcode}
                    onChange={(event) =>
                      setHaulierDraft({
                        ...haulierDraft,
                        postcode: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="wide">
                  <span>Notes</span>
                  <textarea
                    rows={4}
                    value={haulierDraft.notes}
                    onChange={(event) =>
                      setHaulierDraft({
                        ...haulierDraft,
                        notes: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <div className="pilot-compliance-boundary">
                Carrier/DWT compliance administration remains on Web.
                Desktop stores the operational haulier details needed to
                allocate work.
              </div>

              <div className="pilot-manage-actions">
                {selectedHaulier ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={async () => {
                      const result = await mutate({
                        operation: selectedHaulier.isActive
                          ? "haulier.archive"
                          : "haulier.restore",
                        id: selectedHaulier.id,
                      });

                      if (result) {
                        const haulier = result.data.hauliers.find(
                          (item) => item.id === selectedHaulier.id,
                        );
                        if (haulier) beginHaulier(haulier);
                      }
                    }}
                  >
                    {selectedHaulier.isActive
                      ? "Archive Haulier"
                      : "Restore Haulier"}
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={busy || !haulierDraft.name.trim()}
                >
                  {busy
                    ? "Saving…"
                    : haulierDraft.id
                      ? "Save Haulier"
                      : "Create Haulier"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : (
        <div className="pilot-manage-layout">
          <section className="pilot-manage-list">
            <div className="pilot-manage-toolbar">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search site, company, address, postcode or contact…"
              />

              <label>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) =>
                    setShowArchived(event.target.checked)
                  }
                />
                Show archived
              </label>

              <button type="button" onClick={() => beginSite()}>
                + Add Site
              </button>
            </div>

            <div className="pilot-manage-table-head">
              <span>Site / source</span>
              <span>Company / type</span>
              <span>Status</span>
            </div>

            <div className="pilot-manage-rows">
              {visibleSites.map((site) => (
                <button
                  type="button"
                  key={site.id}
                  className={
                    selectedSiteId === site.id ? "active" : ""
                  }
                  onClick={() => beginSite(site)}
                >
                  <span>
                    <strong>{site.name}</strong>
                    <small>
                      {[site.fullAddress, site.postcode]
                        .filter(Boolean)
                        .join(" · ") || "Address not set"}
                    </small>
                  </span>

                  <span>
                    <strong>{site.companyName}</strong>
                    <small>
                      {site.kind === "source"
                        ? "Source / producer site"
                        : site.hasActiveAuthorisation
                          ? "Destination · authorisation present"
                          : "Destination · needs Web authorisation"}
                    </small>
                  </span>

                  <span>
                    <b
                      className={
                        site.isActive
                          ? "pilot-state-active"
                          : "pilot-state-archived"
                      }
                    >
                      {site.isActive ? "Active" : "Archived"}
                    </b>
                  </span>
                </button>
              ))}

              {!visibleSites.length ? (
                <div className="empty-state">
                  No sites match this view.
                </div>
              ) : null}
            </div>
          </section>

          <section className="pilot-manage-editor">
            <form onSubmit={saveSite}>
              <div className="pilot-manage-editor-heading">
                <div>
                  <span className="eyebrow">Operational site</span>
                  <h2>
                    {siteDraft.id
                      ? selectedSite?.name ?? "Site"
                      : "Add Site / Source"}
                  </h2>
                </div>

                {selectedSite ? (
                  <span
                    className={
                      selectedSite.isActive
                        ? "pilot-state-active"
                        : "pilot-state-archived"
                    }
                  >
                    {selectedSite.isActive ? "Active" : "Archived"}
                  </span>
                ) : null}
              </div>

              <div className="pilot-site-kind-switch">
                <button
                  type="button"
                  className={
                    siteDraft.kind === "source" ? "active" : ""
                  }
                  disabled={Boolean(siteDraft.id)}
                  onClick={() =>
                    setSiteDraft({
                      ...EMPTY_SITE,
                      kind: "source",
                    })
                  }
                >
                  Source site
                </button>

                <button
                  type="button"
                  className={
                    siteDraft.kind === "destination" ? "active" : ""
                  }
                  disabled={Boolean(siteDraft.id)}
                  onClick={() =>
                    setSiteDraft({
                      ...EMPTY_SITE,
                      kind: "destination",
                    })
                  }
                >
                  Destination facility
                </button>
              </div>

              <div className="pilot-manage-form">
                <label className="wide">
                  <span>Company / operator</span>
                  <div className="pilot-inline-select-action">
                    <select
                      value={siteDraft.counterpartyId}
                      onChange={(event) =>
                        setSiteDraft({
                          ...siteDraft,
                          counterpartyId: event.target.value,
                        })
                      }
                      required
                    >
                      <option value="">
                        Choose {siteDraft.kind === "source"
                          ? "source company"
                          : "destination operator"}
                      </option>

                      {siteCompanies
                        .filter((company) => company.isActive)
                        .map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setCompanyDraft({
                          ...EMPTY_COMPANY,
                          kind: siteDraft.kind,
                        });
                        setShowCompanyForm(true);
                      }}
                    >
                      + Company
                    </button>
                  </div>
                </label>

                <label className="wide">
                  <span>
                    {siteDraft.kind === "source"
                      ? "Site / project name"
                      : "Facility name"}
                  </span>
                  <input
                    value={siteDraft.name}
                    onChange={(event) =>
                      setSiteDraft({
                        ...siteDraft,
                        name: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label className="wide">
                  <span>Full address</span>
                  <input
                    value={siteDraft.fullAddress}
                    onChange={(event) =>
                      setSiteDraft({
                        ...siteDraft,
                        fullAddress: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="wide">
                  <span>Postcode</span>
                  <input
                    value={siteDraft.postcode}
                    onChange={(event) =>
                      setSiteDraft({
                        ...siteDraft,
                        postcode: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Contact name</span>
                  <input
                    value={siteDraft.contactName}
                    onChange={(event) =>
                      setSiteDraft({
                        ...siteDraft,
                        contactName: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Contact telephone</span>
                  <input
                    value={siteDraft.contactTelephone}
                    onChange={(event) =>
                      setSiteDraft({
                        ...siteDraft,
                        contactTelephone: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="wide">
                  <span>Contact email</span>
                  <input
                    type="email"
                    value={siteDraft.contactEmail}
                    onChange={(event) =>
                      setSiteDraft({
                        ...siteDraft,
                        contactEmail: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="wide">
                  <span>Notes</span>
                  <textarea
                    rows={4}
                    value={siteDraft.notes}
                    onChange={(event) =>
                      setSiteDraft({
                        ...siteDraft,
                        notes: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              {siteDraft.kind === "destination" ? (
                <div
                  className={`pilot-destination-readiness ${
                    selectedSite?.hasActiveAuthorisation
                      ? "ready"
                      : "needs-web"
                  }`}
                >
                  <strong>
                    {selectedSite?.hasActiveAuthorisation
                      ? "Environmental authorisation present"
                      : "Web authorisation setup required"}
                  </strong>

                  <span>
                    Desktop can create and maintain the operational
                    destination record, but permits/authorisations and
                    permitted EWC codes stay on Web before outgoing
                    booking can be compliance-ready.
                  </span>

                  {selectedSite?.authorisationNumbers.length ? (
                    <small>
                      {selectedSite.authorisationNumbers.join(" · ")}
                    </small>
                  ) : null}
                </div>
              ) : null}

              <div className="pilot-manage-actions">
                {selectedSite ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={async () => {
                      const result = await mutate({
                        operation: selectedSite.isActive
                          ? "site.archive"
                          : "site.restore",
                        id: selectedSite.id,
                      });

                      if (result) {
                        const site = result.data.sites.find(
                          (item) => item.id === selectedSite.id,
                        );
                        if (site) beginSite(site);
                      }
                    }}
                  >
                    {selectedSite.isActive
                      ? "Archive Site"
                      : "Restore Site"}
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={
                    busy ||
                    !siteDraft.counterpartyId ||
                    !siteDraft.name.trim()
                  }
                >
                  {busy
                    ? "Saving…"
                    : siteDraft.id
                      ? "Save Site"
                      : "Create Site"}
                </button>
              </div>
            </form>

            {showCompanyForm ? (
              <form
                className="pilot-company-quick-form"
                onSubmit={saveCompany}
              >
                <div className="pilot-company-quick-heading">
                  <div>
                    <span className="eyebrow">Quick company</span>
                    <strong>
                      Add{" "}
                      {companyDraft.kind === "source"
                        ? "source company"
                        : "destination operator"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowCompanyForm(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="pilot-manage-form">
                  <label className="wide">
                    <span>Company name</span>
                    <input
                      value={companyDraft.name}
                      onChange={(event) =>
                        setCompanyDraft({
                          ...companyDraft,
                          name: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    <span>Account reference</span>
                    <input
                      value={companyDraft.accountReference}
                      onChange={(event) =>
                        setCompanyDraft({
                          ...companyDraft,
                          accountReference: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    <span>Telephone</span>
                    <input
                      value={companyDraft.telephone}
                      onChange={(event) =>
                        setCompanyDraft({
                          ...companyDraft,
                          telephone: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="wide">
                    <span>Email</span>
                    <input
                      type="email"
                      value={companyDraft.email}
                      onChange={(event) =>
                        setCompanyDraft({
                          ...companyDraft,
                          email: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="wide">
                    <span>Address</span>
                    <input
                      value={companyDraft.fullAddress}
                      onChange={(event) =>
                        setCompanyDraft({
                          ...companyDraft,
                          fullAddress: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="wide">
                    <span>Postcode</span>
                    <input
                      value={companyDraft.postcode}
                      onChange={(event) =>
                        setCompanyDraft({
                          ...companyDraft,
                          postcode: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div className="pilot-manage-actions">
                  <span />
                  <button
                    type="submit"
                    disabled={busy || !companyDraft.name.trim()}
                  >
                    {busy ? "Creating…" : "Create Company"}
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
