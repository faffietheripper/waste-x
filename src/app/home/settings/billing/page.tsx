export default function BillingSettingsPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
          Waste X Billing
        </p>

        <h1 className="mt-3 text-3xl font-semibold">Billing</h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          Manage subscription, invoices and billing information for your
          organisation.
        </p>
      </section>

      <section className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
        <p className="text-base font-semibold text-black">
          Billing setup coming soon
        </p>

        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
          This area will connect to your subscription and invoice records once
          billing workflows are fully wired.
        </p>
      </section>
    </div>
  );
}
