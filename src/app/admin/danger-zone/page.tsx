import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { resetUserAccount, suspendOrganisation } from "./actions";

export default async function DangerZonePage() {
  await requirePlatformAdmin();
  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="System" title="Danger Zone" description="High-impact platform access controls. Customer Jobs, Loads, DWT records, return snapshots, commercial invoices and transport-emissions evidence are not edited from this screen." />
      <section className="rounded-[1.8rem] border border-red-800 bg-red-950/25 p-6 text-white"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-500">Caution</p><h2 className="mt-2 text-xl font-black">These actions affect customer access.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">Use the organisation and user overview pages first. Historical operational, compliance, commercial and sustainability records must remain intact.</p></section>
      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Organisation Access" title="Suspend organisation" description="Suspends the organisation account. Historical operational/compliance/commercial records remain in the database."><form action={suspendOrganisation} className="space-y-4"><label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-black/40">Organisation ID</span><input name="organisationId" required placeholder="Organisation ID" className="mt-2 w-full rounded-2xl border border-black/15 px-4 py-3 text-sm font-semibold outline-none focus:border-red-500" /></label><button className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-700">Suspend organisation</button></form></AdminPanel>
        <AdminPanel eyebrow="User Access" title="Reset user account" description="Use only when a platform-level account reset is genuinely required."><form action={resetUserAccount} className="space-y-4"><label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-black/40">User ID</span><input name="userId" required placeholder="User ID" className="mt-2 w-full rounded-2xl border border-black/15 px-4 py-3 text-sm font-semibold outline-none focus:border-red-500" /></label><button className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-700">Reset user account</button></form></AdminPanel>
      </section>
    </div>
  );
}
