import { getTemplateWithStructure } from "@/modules/listings/queries/getTemplateWithStructure";
import DynamicWasteListingForm from "@/components/app/Templates/DynamicWasteListingForm";

export default async function TemplateCreatePage({
  params,
}: {
  params: { templateId: string };
}) {
  const template = await getTemplateWithStructure(params.templateId);

  if (!template || !template.isLocked) {
    return <div>Template not available.</div>;
  }

  return (
    <main className=" py-14 px-12">
      <h1 className="text-3xl font-bold mb-6">{template.name}</h1>

      <DynamicWasteListingForm template={template} />
    </main>
  );
}
