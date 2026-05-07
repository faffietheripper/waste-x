export default function TermsSettingsPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
          Waste X Policies
        </p>

        <h1 className="mt-3 text-3xl font-semibold">Terms & Policies</h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          Review platform terms, compliance policies and operational usage
          guidance.
        </p>
      </section>

      <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-black">Policy Documents</h2>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          <PolicyCard title="Terms of Use" />
          <PolicyCard title="Privacy Policy" />
          <PolicyCard title="Compliance Policy" />
        </div>
      </section>
    </div>
  );
}

function PolicyCard({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5">
      <p className="text-sm font-semibold text-black">{title}</p>
      <p className="mt-2 text-sm leading-6 text-black/45">
        Document content can be added here when legal copy is ready.
      </p>
    </div>
  );
}
