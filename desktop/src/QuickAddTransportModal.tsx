import { invoke } from "@tauri-apps/api/core";
import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

export type QuickTransportKind = "driver" | "vehicle";

type MutationResponse = {
  ok: true;
  action: "created" | "updated" | "archived" | "restored";
  entityType: "driver" | "vehicle";
  entityId: string;
  syncFeedWarning: boolean;
};

export function QuickAddTransportModal({
  open,
  kind,
  jobNumber,
  loadNumber,
  haulierCounterpartyId,
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: QuickTransportKind;
  jobNumber: string;
  loadNumber: number | null;
  haulierCounterpartyId: string | null;
  onClose: () => void;
  onCreated: (
    kind: QuickTransportKind,
    entityId: string,
  ) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [tareWeightKg, setTareWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setName("");
    setTelephone("");
    setEmail("");
    setRegistrationNumber("");
    setVehicleType("");
    setTareWeightKg("");
    setNotes("");
    setError(null);
  }, [open, kind]);

  if (!open) return null;

  function optional(value: string) {
    const clean = value.trim();
    return clean ? clean : null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const input =
        kind === "driver"
          ? {
              operation: "driver.create",
              data: {
                id: crypto.randomUUID(),
                name,
                telephone: optional(telephone),
                email: optional(email),
                haulierCounterpartyId,
                defaultVehicleId: null,
                notes: optional(notes),
              },
            }
          : {
              operation: "vehicle.create",
              data: {
                id: crypto.randomUUID(),
                registrationNumber,
                vehicleType: optional(vehicleType),
                haulierCounterpartyId,
                tareWeightKg: optional(tareWeightKg),
                notes: optional(notes),
              },
            };

      const result = await invoke<MutationResponse>(
        "desktop_mutate_transport_local",
        { input },
      );

      try {
        await invoke("desktop_sync_transport_mutations");
      } catch {
        // Local record is already durable and automatic sync will retry.
      }
      await onCreated(kind, result.entityId);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="pilot-quick-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="pilot-quick-transport-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-transport-title"
      >
        <div className="pilot-quick-modal-heading">
          <div>
            <span className="eyebrow">Quick operational master data</span>
            <h2 id="quick-transport-title">
              Add {kind === "driver" ? "Driver" : "Vehicle"}
            </h2>
            <p>
              {jobNumber} · Load {loadNumber ?? "—"}
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="pilot-quick-carrier">
          <span>Carrier</span>
          <strong>
            {haulierCounterpartyId
              ? "External haulier assigned to this Load"
              : "Own fleet"}
          </strong>
          <small>
            The new {kind} is created against this Load's current carrier.
          </small>
        </div>

        {error ? (
          <div className="pilot-manage-message bad">{error}</div>
        ) : null}

        <form className="pilot-quick-transport-form" onSubmit={submit}>
          {kind === "driver" ? (
            <>
              <label className="wide">
                <span>Driver name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                  required
                />
              </label>

              <label>
                <span>Telephone</span>
                <input
                  value={telephone}
                  onChange={(event) => setTelephone(event.target.value)}
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label className="wide">
                <span>Registration</span>
                <input
                  value={registrationNumber}
                  onChange={(event) =>
                    setRegistrationNumber(event.target.value)
                  }
                  placeholder="AB12CDE"
                  autoFocus
                  required
                />
              </label>

              <label>
                <span>Vehicle type</span>
                <input
                  value={vehicleType}
                  onChange={(event) => setVehicleType(event.target.value)}
                  placeholder="Tipper, skip lorry…"
                />
              </label>

              <label>
                <span>Stored tare (kg)</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={tareWeightKg}
                  onChange={(event) =>
                    setTareWeightKg(event.target.value)
                  }
                  placeholder="e.g. 12500"
                />
              </label>
            </>
          )}

          <label className="wide">
            <span>Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="pilot-quick-modal-actions wide">
            <span>
              Saves to this Desktop's encrypted working set first.
              Waste X Cloud syncs automatically when available.
            </span>

            <button
              type="submit"
              disabled={
                busy ||
                (kind === "driver"
                  ? !name.trim()
                  : !registrationNumber.trim())
              }
            >
              {busy
                ? "Creating…"
                : `Create ${kind === "driver" ? "Driver" : "Vehicle"}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
