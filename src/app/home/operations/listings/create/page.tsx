import Link from "next/link";
import { getOrgTemplates } from "@/app/home-old/team-dashboard/template-library/actions";
import { auth } from "@/auth";

export default async function CreateWasteListing() {
  const templates = await getOrgTemplates();
  const session = await auth();

  const lockedTemplates = templates.filter((t) => t.isLocked);

  return (
    <main className=" py-14 px-12">
      <h1 className="text-3xl font-bold mb-10">Select Listing Template</h1>

      {/* ✅ NO TEMPLATES STATE */}
      {lockedTemplates.length === 0 && (
        <div className="max-w-2xl border rounded-lg p-8 bg-gray-50">
          <h2 className="text-xl font-semibold mb-3">No templates available</h2>

          <p className="text-gray-600 mb-6">
            There are currently no published templates available for your
            organisation.
          </p>

          <p className="text-gray-600 mb-6">
            Please ask your company administrator to publish a template so you
            can create a waste listing.
          </p>

          {/* 👇 Admin CTA */}
          {session?.user?.role === "administrator" && (
            <div className="mt-4">
              <Link
                href="/home/team-dashboard/template-library"
                className="inline-block bg-black text-white px-6 py-3 rounded hover:bg-gray-800 transition"
              >
                Create or publish templates
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ✅ TEMPLATE LIST */}
      {lockedTemplates.length > 0 && (
        <div className="space-y-4 max-w-2xl">
          {lockedTemplates.map((template) => (
            <Link
              key={template.id}
              href={`/home/create-waste-listings/${template.id}`}
              className="block border p-6 rounded hover:bg-gray-50"
            >
              <div className="font-semibold text-lg">{template.name}</div>
              <div className="text-sm text-gray-500">
                Version {template.version}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
