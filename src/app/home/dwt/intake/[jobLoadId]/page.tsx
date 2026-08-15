import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobLoads, users } from "@/db/schema";
import {
  type Capability,
  type DepartmentType,
  hasOperationalPermissionForOrganisation,
} from "@/modules/auth/core/permissions";
import { getJobLoadReceiveMovementDraft } from "@/modules/digital-waste-tracking/core/getJobLoadReceiveMovementDraft";
import { getLatestWasteTrackingSubmissionByJobLoad } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingSubmissionByJobLoad";
import { prepareJobLoadDwtDraftAction } from "../../actions";

import JobLoadReceiveMovementForm from "./JobLoadReceiveMovementForm";

type PageProps = {
  params: { jobLoadId: string };
};

export default async function DwtJobLoadReviewPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: { organisation: true, department: true },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, params.jobLoadId),
      eq(jobLoads.organisationId, currentUser.organisationId),
    ),
    with: { job: true, client: true, clientSite: true },
  });

  if (!load) redirect("/home/dwt?error=load_not_found");

  if (load.direction !== "incoming" || load.status !== "completed") {
    redirect("/home/dwt?error=load_not_ready");
  }

  const draft = await getJobLoadReceiveMovementDraft({
    organisationId: currentUser.organisationId,
    jobLoadId: load.id,
  });

  if (!draft) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
        <div className="px-10 py-10">
          <Link href="/home/dwt" className="text-sm font-semibold text-orange-700">
            ← Back to DWT Centre
          </Link>
          <section className="mt-6 rounded-[2rem] border border-orange-200 bg-orange-50 p-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-700">
              DWT receipt draft
            </p>
            <h1 className="mt-3 text-3xl font-semibold">
              Prepare {load.job.jobNumber} · Load {load.loadNumber}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-orange-900/70">
              This is a completed incoming Job Load but it does not have a DWT
              receipt draft yet. Prepare one from the factual load snapshot,
              then review it before anything is sent to Defra.
            </p>
            <form action={prepareJobLoadDwtDraftAction} className="mt-6">
              <input type="hidden" name="jobLoadId" value={load.id} />
              <button className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white">
                Prepare receipt draft
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  const latestSubmission = await getLatestWasteTrackingSubmissionByJobLoad({
    organisationId: currentUser.organisationId,
    jobLoadId: load.id,
  });

  const capabilities =
    (currentUser.organisation.capabilities as Capability[] | null) ?? [];
  const departmentType =
    (currentUser.department?.type as DepartmentType | undefined) ?? null;

  const canSubmit = hasOperationalPermissionForOrganisation({
    capabilities,
    departmentType,
    permission: "dwt:submit_receive_movement",
    operatingMode: currentUser.organisation.operatingMode,
  });

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/home/dwt" className="text-sm font-semibold text-orange-700">
            ← DWT Centre
          </Link>
          <Link
            href={`/home/jobs/${draft.jobId}`}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/55"
          >
            Open Job
          </Link>
        </div>

        <JobLoadReceiveMovementForm
          jobLoadId={draft.jobLoadId}
          jobNumber={draft.jobNumber}
          loadNumber={draft.loadNumber}
          clientName={draft.clientName}
          originName={draft.originName}
          receiptId={draft.receiptId}
          canSubmit={canSubmit}
          existingWasteTrackingId={latestSubmission?.wasteTrackingId ?? null}
          defaultInput={draft.receiveMovementInput}
        />
      </div>
    </main>
  );
}
