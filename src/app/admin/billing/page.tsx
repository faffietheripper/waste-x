import Link from "next/link";

import { AdminEmptyState, AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

export default async function AdminPlatformBillingPage() {
  await requirePlatformAdmin();
  const data = await getAdminWorkflowHealth(90);
  const orgRows = data.organisations
    .filter((row) => row.status === "ACTIVE" || row.platformBilling.platformInvoices > 0)
    .sort((a, b) => Number(b.subscriptionStatus === "past_due") - Number(a.subscriptionStatus === "past_due") || b.platformBilling.failed - a.platformBilling.failed);

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Platform Business" title="Platform Billing" description="Waste X subscription billing and platform invoice health. This is deliberately separate from the customer Commercial & Invoicing workflow, where organisations invoice their own customers." actions={<Link href="/admin/commercial" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Customer Commercials</Link>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Active subscriptions" value={data.billing.activeSubscriptions} helper={`${data.billing.trialSubscriptions} trial subscriptions`} />
        <AdminMetric label="Past due" value={data.billing.pastDueOrganisations} helper="Organisation subscription status" danger={data.billing.pastDueOrganisations > 0} />
        <AdminMetric label="Platform invoices" value={data.billing.platformInvoices} helper={`${data.days}-day window`} />
        <AdminMetric label="Failed invoices" value={data.billing.failedInvoices} helper={`${data.billing.pendingInvoices} pending`} danger={data.billing.failedInvoices > 0} />
        <AdminMetric label="Paid value" value={money(data.billing.paidValue)} helper={`${data.billing.paidInvoices} paid platform invoices`} tone="success" />
      </section>

      <AdminPanel eyebrow="Subscriptions" title="Organisation billing status">
        <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Organisation</TableHead><TableHead>Plan</TableHead><TableHead>Subscription</TableHead><TableHead>Invoices</TableHead><TableHead>Paid</TableHead><TableHead>Failed</TableHead><TableHead>Paid value</TableHead></tr></thead><tbody className="divide-y divide-black/10">{orgRows.map((row) => <tr key={row.id} className="hover:bg-red-50/30"><TableCell><Link href={`/admin/organisations/${row.id}`} className="font-black text-black hover:text-red-600">{row.teamName}</Link></TableCell><TableCell>{formatLabel(row.subscriptionPlan ?? "starter")}</TableCell><TableCell><AdminStatusPill label={formatLabel(row.subscriptionStatus ?? "trial")} tone={row.subscriptionStatus === "past_due" || row.subscriptionStatus === "cancelled" ? "danger" : row.subscriptionStatus === "active" ? "success" : "warning"} /></TableCell><TableCell>{row.platformBilling.platformInvoices}</TableCell><TableCell>{row.platformBilling.paid}</TableCell><TableCell><span className={row.platformBilling.failed > 0 ? "font-black text-red-600" : "font-black text-black"}>{row.platformBilling.failed}</span></TableCell><TableCell>{money(row.platformBilling.paidValue)}</TableCell></tr>)}</tbody></table></div></div>
      </AdminPanel>

      <AdminPanel eyebrow="Platform Invoice Register" title="Recent Waste X billing invoices">
        {data.recentPlatformInvoices.length === 0 ? <AdminEmptyState>No Waste X platform invoices were recorded in this reporting window.</AdminEmptyState> : <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Organisation</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Stripe invoice</TableHead><TableHead>Created</TableHead><TableHead>Paid</TableHead></tr></thead><tbody className="divide-y divide-black/10">{data.recentPlatformInvoices.map((invoice) => <tr key={invoice.id} className="hover:bg-red-50/30"><TableCell><Link href={`/admin/organisations/${invoice.organisationId}`} className="font-black text-black hover:text-red-600">{invoice.organisationName}</Link></TableCell><TableCell><AdminStatusPill label={formatLabel(invoice.status)} tone={invoice.status === "failed" ? "danger" : invoice.status === "paid" ? "success" : "warning"} /></TableCell><TableCell>{money(invoice.amount)}</TableCell><TableCell><span className="font-mono text-xs text-black/45">{invoice.stripeInvoiceId ?? "—"}</span></TableCell><TableCell>{date(invoice.createdAt)}</TableCell><TableCell>{date(invoice.paidAt)}</TableCell></tr>)}</tbody></table></div></div>}
      </AdminPanel>
    </div>
  );
}

function money(value: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value); }
function date(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)); }
function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
