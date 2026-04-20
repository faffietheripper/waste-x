import Link from "next/link";
import { getOrgTemplates, cloneTemplate } from "./actions";

export default async function TemplateLibraryPage() {
  const templates = await getOrgTemplates();

  return (
    <div className="p-10 bg-gray-900 text-gray-200 min-h-screen">
      <div className="flex justify-between mb-8">
        <h1 className="text-2xl font-semibold">Template Library</h1>

        <Link
          href="/home/team-dashboard/template-library/create-template"
          className="bg-orange-600 text-white px-5 py-2 rounded"
        >
          + Create Template
        </Link>
      </div>

      <div className="border border-gray-700 rounded">
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex justify-between items-center p-4 border-b border-gray-800"
          >
            <div>
              <div className="font-medium">{template.name}</div>
              <div className="text-sm text-gray-500">
                Version {template.version}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <Link
                href={`/home/team-dashboard/template-library/${template.id}?preview=true`}
                className="text-blue-400"
              >
                Preview
              </Link>

              <form
                action={async () => {
                  "use server";
                  await cloneTemplate(template.id);
                }}
              >
                <button type="submit" className="text-orange-400">
                  Clone
                </button>
              </form>

              <span>{template.isLocked ? "Locked" : "Active"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
