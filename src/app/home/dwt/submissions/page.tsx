import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, wasteTrackingSubmissions } from "@/db/schema";

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function label(value: string | null | undefined) {
  if (!value) return "Not attempted";
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClasses(status: string) {
  if (status === "accepted") return "bg-emerald-50 text-emerald-700";
  if (status === "accepted_with_warnings") return "bg-orange-50 text-orange-700";
  if (status === "rejected" || status === "failed") return "bg-red-50 text-red-700";
  if (status === "submitted") return "bg-blue-50 text-blue-700";
  return "bg-black/5 text-black/45";
}

function parseCount(value: string | null) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export default async function DwtSubmissionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { organisationId: true },
  });

  if (!currentUser?.organisationId) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const submissions = await database.query.wasteTrackingSubmissions.findMany({
    where: eq(
      wasteTrackingSubmissions.organisationId,
      currentUser.organisationId,
    ),
    with: {
      jobLoad: {
        with: {
          job: true,
          client: true,
        },
      },
      assignment: {
        with: { listing: true },
      },
      receipt: true,
      submittedByUser: true,
    },
    orderBy: [desc(wasteTrackingSubmissions.createdAt)],
    limit: 200,
  });

  const accepted = submissions.filter((row) => row.status === "accepted").length;
  const warnings = submissions.filter(
    (row) => row.status === "accepted_with_warnings",
  ).length;
  const problems = submissions.filter((row) =>
    ["rejected", "failed"].includes(row.status),
  ).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                DWT · Audit trail
              </p>
              <h1 className="mt-4 text-4xl font-semibold">Submissions</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                New Solo Job Load attempts and the existing legacy assignment
                attempts share the same formal Defra request/response audit table.
              </p>
            </div>
            <Link
              href="/home/dwt"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black"
            >
              DWT Centre
            </Link>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <Metric label="Attempts" value={submissions.length} />
          <Metric label="Accepted" value={accepted} />
          <Metric label="Accepted with warnings" value={warnings} />
          <Metric label="Failed / rejected" value={problems} />
        </section>

        <section className="mt-8 overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-black text-white">
                <tr>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.14em] text-white/55">Source</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.14em] text-white/55">Status</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.14em] text-white/55">Method</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.14em] text-white/55">WTID</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.14em] text-white/55">Issues</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.14em] text-white/55">Attempted</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.14em] text-white/55">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {submissions.map((submission) => {
                  const isSolo = Boolean(submission.jobLoadId && submission.jobLoad);
                  const jobLoad = submission.jobLoad;
                  const sourceTitle = isSolo
                    ? `${jobLoad?.job.jobNumber ?? "Job"} · Load ${jobLoad?.loadNumber ?? "—"}`
                    : submission.assignment?.listing?.name ??
                      `Legacy assignment ${submission.assignmentId?.slice(0, 8) ?? "—"}`;
                  const sourceSub = isSolo
                    ? jobLoad?.client?.name ?? "Solo Job Load"
                    : "Legacy / approved receiving workflow";

                  const errorCount = parseCount(submission.validationErrors);
                  const warningCount = parseCount(submission.validationWarnings);

                  return (
                    <tr key={submission.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{sourceTitle}</p>
                        <p className="mt-1 text-xs text-black/40">{sourceSub}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClasses(submission.status)}`}>
                          {label(submission.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-black/55">
                        {submission.method ?? "Not attempted"}
                      </td>
                      <td className="max-w-[240px] break-all px-5 py-4 text-xs text-black/55">
                        {submission.wasteTrackingId ?? "Not issued"}
                      </td>
                      <td className="px-5 py-4 text-black/55">
                        {errorCount} error{errorCount === 1 ? "" : "s"} ·{" "}
                        {warningCount} warning{warningCount === 1 ? "" : "s"}
                      </td>
                      <td className="px-5 py-4 text-black/55">
                        {formatDate(submission.lastAttemptedAt ?? submission.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        {submission.jobLoadId ? (
                          <Link
                            href={`/home/dwt/intake/${submission.jobLoadId}`}
                            className="font-semibold text-orange-700"
                          >
                            Review
                          </Link>
                        ) : submission.assignmentId ? (
                          <Link
                            href={`/home/receiving/intake/${submission.assignmentId}`}
                            className="font-semibold text-blue-700"
                          >
                            Legacy intake
                          </Link>
                        ) : (
                          <span className="text-black/30">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {submissions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center text-black/40">
                      No DWT submission attempts have been recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}
