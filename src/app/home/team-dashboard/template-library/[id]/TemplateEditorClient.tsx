"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import AddSectionModal from "@/components/app/Templates/AddSectionModal";
import AddFieldModal from "@/components/app/Templates/AddFieldModal";
import FieldSettingsPanel from "@/components/app/Templates/FieldSettingsPanel";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

/* ===============================
   Sortable Section
================================ */

function SortableSection({
  section,
  template,
  onAddField,
  onDeleteSection,
}: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gray-800 border border-gray-700 rounded-md p-3 mb-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab">
            ☰
          </div>
          <span className="text-sm font-medium">{section.title}</span>
        </div>

        {!template.isLocked && (
          <div className="flex gap-4 text-xs">
            <button
              onClick={() => onAddField(section.id)}
              className="text-orange-400"
            >
              + Field
            </button>

            <button
              onClick={() => onDeleteSection(section.id)}
              className="text-red-400"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===============================
   Sortable Field
================================ */

function SortableField({ field, template, onDeleteField, onSelect }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gray-800 border border-gray-700 p-4 mb-3 rounded flex justify-between items-center"
    >
      <div className="flex items-center gap-3">
        <div {...attributes} {...listeners} className="cursor-grab">
          ☰
        </div>

        <div
          onClick={() => !template.isLocked && onSelect(field)}
          className="cursor-pointer"
        >
          <div className="font-medium text-sm">{field.label}</div>
          <div className="text-xs text-gray-500">{field.fieldType}</div>
        </div>
      </div>

      {!template.isLocked && (
        <button
          onClick={() => onDeleteField(field.id)}
          className="text-xs text-red-400"
        >
          Delete
        </button>
      )}
    </div>
  );
}

/* ===============================
   Main Builder
================================ */

export default function TemplateEditorClient({ template }: { template: any }) {
  const router = useRouter();

  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddFieldForSection, setShowAddFieldForSection] = useState<
    string | null
  >(null);
  const [selectedField, setSelectedField] = useState<any>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  const orderedSections = [...template.sections].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  async function deleteSection(sectionId: string) {
    if (!confirm("Delete this section?")) return;

    const { deleteSection } =
      await import("@/app/home/team-dashboard/template-library/actions");

    await deleteSection(sectionId);
    router.refresh();
  }

  async function deleteField(fieldId: string) {
    if (!confirm("Delete this field?")) return;

    const { deleteField } =
      await import("@/app/home/team-dashboard/template-library/actions");

    await deleteField(fieldId);
    router.refresh();
  }

  async function handleSectionDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedSections.findIndex((s) => s.id === active.id);
    const newIndex = orderedSections.findIndex((s) => s.id === over.id);

    const newOrder = arrayMove(orderedSections, oldIndex, newIndex);

    const { reorderSections } =
      await import("@/app/home/team-dashboard/template-library/actions");

    await reorderSections(
      template.id,
      newOrder.map((s) => s.id),
    );

    router.refresh();
  }

  return (
    <>
      <div className="mb-6 border border-orange-500/30 bg-orange-500/10 p-4 rounded-md">
        <p className="text-xs text-orange-400 font-semibold mb-2">
          ⚠️ Waste Listing System Fields
        </p>

        <p className="text-xs text-black leading-relaxed">
          Waste X already includes core fields for all listings. You do{" "}
          <strong>not</strong> need to add these manually in your template:
        </p>

        <ul className="mt-2 text-xs text-black list-disc list-inside space-y-1">
          <li>Project Name</li>
          <li>Location</li>
          <li>Starting Price</li>
          <li>End Date</li>
          <li>File Uploads</li>
        </ul>

        <p className="mt-3 text-xs text-neutral-500">
          Use templates only for <strong>waste-specific data</strong>{" "}
          (materials, contamination, handling requirements, etc).
        </p>
      </div>
      <div className="h-screen flex bg-gray-900 text-gray-200">
        {/* LEFT PANEL */}
        <div className="w-1/4 border-r border-gray-800 p-6">
          <div className="flex justify-between mb-6">
            <h2 className="text-sm uppercase text-gray-400">Sections</h2>

            {!template.isLocked && (
              <button
                onClick={() => setShowAddSection(true)}
                className="text-xs text-orange-400"
              >
                + Add
              </button>
            )}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
          >
            <SortableContext
              items={orderedSections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {orderedSections.map((section) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  template={template}
                  onAddField={setShowAddFieldForSection}
                  onDeleteSection={deleteSection}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* CENTER PANEL */}
        <div className="w-2/4 p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-xl font-semibold">{template.name}</h1>

            <button
              onClick={async () => {
                const { toggleTemplateLock } =
                  await import("@/app/home/team-dashboard/template-library/actions");

                await toggleTemplateLock(template.id);
                router.refresh();
              }}
              className={`px-4 py-2 text-sm rounded ${
                template.isLocked
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-orange-600 hover:bg-orange-700"
              }`}
            >
              {template.isLocked ? "Unlock Template" : "Lock Template"}
            </button>
          </div>

          {orderedSections.map((section) => {
            const orderedFields = [...section.fields].sort(
              (a: any, b: any) => a.orderIndex - b.orderIndex,
            );

            async function handleFieldDragEnd(event: any) {
              const { active, over } = event;
              if (!over || active.id === over.id) return;

              const oldIndex = orderedFields.findIndex(
                (f: any) => f.id === active.id,
              );
              const newIndex = orderedFields.findIndex(
                (f: any) => f.id === over.id,
              );

              const newOrder = arrayMove(orderedFields, oldIndex, newIndex);

              const { reorderFields } =
                await import("@/app/home/team-dashboard/template-library/actions");

              await reorderFields(
                section.id,
                newOrder.map((f: any) => f.id),
              );

              router.refresh();
            }

            return (
              <div key={section.id} className="mb-10">
                <h3 className="text-sm uppercase text-gray-500 mb-4">
                  {section.title}
                </h3>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleFieldDragEnd}
                >
                  <SortableContext
                    items={orderedFields.map((f: any) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {orderedFields.map((field: any) => (
                      <SortableField
                        key={field.id}
                        field={field}
                        template={template}
                        onDeleteField={deleteField}
                        onSelect={setSelectedField}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            );
          })}
        </div>

        {/* RIGHT PANEL */}
        {selectedField && !template.isLocked && (
          <FieldSettingsPanel
            field={selectedField}
            onClose={() => setSelectedField(null)}
          />
        )}

        {/* MODALS */}
        {showAddSection && !template.isLocked && (
          <AddSectionModal
            templateId={template.id}
            onClose={() => setShowAddSection(false)}
          />
        )}

        {showAddFieldForSection && !template.isLocked && (
          <AddFieldModal
            templateId={template.id}
            sectionId={showAddFieldForSection}
            onClose={() => setShowAddFieldForSection(null)}
          />
        )}
      </div>
    </>
  );
}
