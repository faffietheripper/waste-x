"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import AddSectionModal from "@/components/app/Templates/AddSectionModal";
import AddFieldModal from "@/components/app/Templates/AddFieldModal";
import FieldSettingsPanel from "@/components/app/Templates/FieldSettingsPanel";

import {
  deleteSectionAction,
  deleteFieldAction,
  reorderSectionsAction,
  reorderFieldsAction,
  toggleTemplateLockAction,
} from "@/modules/templates/actions/templateActions";

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

/* ==============================
   SECTION CARD
============================== */

function SortableSection({
  section,
  template,
  onAddField,
  onDeleteSection,
}: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: section.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-400"
          >
            ☰
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {section.title}
          </span>
        </div>

        {!template.isLocked && (
          <div className="flex gap-2">
            <button
              onClick={() => onAddField(section.id)}
              className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
            >
              + Field
            </button>

            <button
              onClick={() => onDeleteSection(section.id)}
              className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==============================
   FIELD CARD
============================== */

function SortableField({ field, template, onDeleteField, onSelect }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="bg-white border rounded-lg p-4 shadow-sm flex justify-between items-center hover:shadow-md transition"
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-400"
        >
          ☰
        </div>

        <div
          onClick={() => !template.isLocked && onSelect(field)}
          className="cursor-pointer"
        >
          <div className="text-sm font-semibold text-gray-900">
            {field.label}
          </div>
          <div className="text-xs text-gray-500">{field.fieldType}</div>
        </div>
      </div>

      {!template.isLocked && (
        <button
          onClick={() => onDeleteField(field.id)}
          className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200"
        >
          Delete
        </button>
      )}
    </div>
  );
}

/* ==============================
   MAIN EDITOR
============================== */

export default function TemplateEditorClient({ template }: { template: any }) {
  const router = useRouter();

  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddFieldForSection, setShowAddFieldForSection] = useState<
    string | null
  >(null);
  const [selectedField, setSelectedField] = useState<any>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  const orderedSections = [...(template.sections ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  async function deleteSection(sectionId: string) {
    if (!confirm("Delete this section?")) return;
    await deleteSectionAction(sectionId);
    router.refresh();
  }

  async function deleteField(fieldId: string) {
    if (!confirm("Delete this field?")) return;
    await deleteFieldAction(fieldId);
    router.refresh();
  }

  async function handleSectionDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedSections.findIndex((s) => s.id === active.id);
    const newIndex = orderedSections.findIndex((s) => s.id === over.id);

    const newOrder = arrayMove(orderedSections, oldIndex, newIndex);

    await reorderSectionsAction(
      template.id,
      newOrder.map((s) => s.id),
    );

    router.refresh();
  }

  return (
    <main className="min-h-screen pl-[24vw] mt-32 p-10 bg-gray-50">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {template.name}
          </h1>
          <p className="text-sm text-gray-500">
            Configure structured listing template
          </p>
        </div>

        <button
          onClick={async () => {
            await toggleTemplateLockAction(template.id);
            router.refresh();
          }}
          className={`px-4 py-2 text-sm rounded-md text-white ${
            template.isLocked
              ? "bg-red-600 hover:bg-red-700"
              : "bg-orange-600 hover:bg-orange-700"
          }`}
        >
          {template.isLocked ? "Unlock Template" : "Lock Template"}
        </button>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-12 gap-8">
        {/* LEFT */}
        <div className="col-span-3 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xs uppercase text-gray-500">Sections</h2>

            {!template.isLocked && (
              <button
                onClick={() => setShowAddSection(true)}
                className="text-xs px-2 py-1 rounded bg-orange-600 text-white hover:bg-orange-700"
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
              <div className="space-y-3">
                {orderedSections.map((section) => (
                  <SortableSection
                    key={section.id}
                    section={section}
                    template={template}
                    onAddField={setShowAddFieldForSection}
                    onDeleteSection={deleteSection}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* CENTER */}
        <div className="col-span-6 space-y-8">
          {orderedSections.map((section) => {
            const orderedFields = [...(section.fields ?? [])].sort(
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

              await reorderFieldsAction(
                section.id,
                newOrder.map((f: any) => f.id),
              );

              router.refresh();
            }

            return (
              <div key={section.id}>
                <h3 className="text-sm font-semibold mb-4 text-gray-600">
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
                    <div className="space-y-3">
                      {orderedFields.map((field: any) => (
                        <SortableField
                          key={field.id}
                          field={field}
                          template={template}
                          onDeleteField={deleteField}
                          onSelect={setSelectedField}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            );
          })}
        </div>

        {/* RIGHT */}
        <div className="col-span-3">
          {selectedField && !template.isLocked && (
            <FieldSettingsPanel
              field={selectedField}
              onClose={() => setSelectedField(null)}
            />
          )}
        </div>
      </div>

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
    </main>
  );
}
