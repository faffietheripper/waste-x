import Link from "next/link";

import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminControlTowerData } from "@/modules/admin/core/getAdminControlTowerData";

export default async function AdminAlertsPage() {
  await requirePlatformAdmin();
  const data = await getAdminControlTowerData();

  const setupAlerts = data.organisations.needsSetup;
  const pending = data.organisations.recent.filter((org) => org.status === "PENDING");
  const dwtAlerts = data.dwt.needsAttention24;
  const supportAlerts = data.support.urgent + data.support.unassigned;
  const systemAlerts = data.system.unresolvedErrors;
  const total = pending.length + setupAlerts.length + dwtAlerts + supportAlerts + systemAlerts;

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Platform Operations" title="Alerts" description="Solo Waste Manager platform alerts only: onboarding, workspace readiness, DWT submission attention, support and system health. Legacy assignment/listing incident alerts are no longer the primary admin model." actions={<Link href="/admin" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Control Tower</Link>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Alerts" value={total} helper="Current platform alert signals" danger={total > 0} />
        <AdminMetric label="Onboarding" value={data.organisations.pending} helper="Pending organisation approvals" danger={data.organisations.pending > 0} />
        <AdminMetric label="DWT" value={dwtAlerts} helper="Rejected / failed in last 24h" danger={dwtAlerts > 0} />
        <AdminMetric label="Support" value={supportAlerts} helper="Urgent + unassigned active tickets" danger={supportAlerts > 0} />
        <AdminMetric label="System" value={systemAlerts} helper="Unresolved system errors" danger={systemAlerts > 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Customer Readiness" title="Workspaces needing setup" action={<Link href="/admin/organisations" className="text-xs font-black text-red-600">Organisations →</Link>}>
          {setupAlerts.length === 0 ? <Empty text="No active customer workspaces need core setup attention." /> : (
            <div className="space-y-3">
              {setupAlerts.map((item) => (
                <Link key={item.organisation.id} href={`/admin/organisations/${item.organisation.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-red-100 bg-red-50/40 p-4 hover:border-red-300">
                  <div><p className="text-sm font-black text-black">{item.organisation.teamName}</p><p className="mt-1 text-xs text-black/40">{item.readyCount}/{item.totalChecks} checks passed</p></div>
                  <AdminStatusPill label="Setup needed" tone="danger" />
                </Link>
              ))}
            </div>
          )}
        </AdminPanel>

        <AdminPanel eyebrow="DWT & System" title="Technical attention" action={<Link href="/admin/digital-waste-tracking" className="text-xs font-black text-red-600">DWT Control →</Link>}>
          <div className="space-y-3">
            <AlertRow label="DWT rejected / failed · 24h" value={dwtAlerts} href="/admin/digital-waste-tracking" />
            <AlertRow label="Unresolved platform errors" value={systemAlerts} href="/admin/errors" />
            <AlertRow label="Critical errors" value={data.system.criticalErrors} href="/admin/errors?severity=critical" />
            <AlertRow label="External-service errors" value={data.system.externalErrors} href="/admin/errors" />
          </div>
        </AdminPanel>
      </section>

      <AdminPanel eyebrow="Customer Support" title="Support attention" action={<Link href="/admin/support" className="text-xs font-black text-red-600">Support →</Link>}>
        <div className="grid gap-3 md:grid-cols-3">
          <AlertBox label="Active tickets" value={data.support.open} />
          <AlertBox label="Urgent" value={data.support.urgent} danger />
          <AlertBox label="Unassigned" value={data.support.unassigned} danger />
        </div>
      </AdminPanel>
    </div>
  );
}

function AlertRow({ label, value, href }: { label: string; value: number; href: string }) { return <Link href={href} className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 hover:border-red-300"><span className="text-sm font-bold text-black">{label}</span><span className={value > 0 ? "text-sm font-black text-red-600" : "text-sm font-black text-black"}>{value}</span></Link>; }
function AlertBox({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={`rounded-2xl border p-4 ${danger && value > 0 ? "border-red-200 bg-red-50" : "border-black/10"}`}><p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">{label}</p><p className={`mt-2 text-2xl font-black ${danger && value > 0 ? "text-red-600" : "text-black"}`}>{value}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-black/15 p-6 text-sm font-semibold text-black/40">{text}</div>; }
