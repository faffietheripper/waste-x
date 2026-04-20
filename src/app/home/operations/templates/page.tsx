import { auth } from "@/auth";
import { database } from "@/db/database";
import { listingTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function TemplatesPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const organisationId = session.user.organisationId;

  const templates = await database.query.listingTemplates.findMany({
    where: eq(listingTemplates.organisationId, organisationId),
  });

  const active = templates.filter((t) => !t.archived);
  const archived = templates.filter((t) => t.archived);

  return (
    <div className="p-10 flex flex-col gap-12 mt-32">
      {/* HEADER */}
      <div className="pl-[24vw] flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Template Library</h1>
          <p className="text-sm text-gray-500">
            Manage your reusable listing templates
          </p>
        </div>

        <Link
          href="/home/operations/templates/create"
          className="bg-black text-white text-sm px-5 py-2.5 rounded-md hover:opacity-90 transition"
        >
          + Create Template
        </Link>
      </div>

      {/* ACTIVE */}
      <div className="pl-[24vw] flex flex-col gap-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Active Templates
        </h2>

        <div className="grid grid-cols-3 gap-6">
          {active.length === 0 ? (
            <p className="text-sm text-gray-400">No active templates.</p>
          ) : (
            active.map((template) => (
              <div
                key={template.id}
                className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition"
              >
                <h3 className="text-sm font-semibold text-gray-800">
                  {template.name}
                </h3>

                <p className="text-xs text-gray-500 mt-1">
                  Version {template.version}
                </p>

                <Link
                  href={`/home/operations/templates/${template.id}`}
                  className="inline-block mt-4 text-xs text-blue-600 hover:underline"
                >
                  View Template →
                </Link>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ARCHIVED */}
      <div className="pl-[24vw] flex flex-col gap-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Archived Templates
        </h2>

        <div className="grid grid-cols-3 gap-6 opacity-70">
          {archived.length === 0 ? (
            <p className="text-sm text-gray-400">No archived templates.</p>
          ) : (
            archived.map((template) => (
              <div
                key={template.id}
                className="border border-gray-200 rounded-xl p-6 bg-white"
              >
                <h3 className="text-sm font-semibold text-gray-700">
                  {template.name}
                </h3>

                <p className="text-xs text-gray-400 mt-1">
                  Version {template.version}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
