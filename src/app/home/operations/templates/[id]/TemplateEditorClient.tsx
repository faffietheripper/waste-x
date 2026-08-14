"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TemplateDwtProfileEditor from "@/components/app/Templates/TemplateDwtProfileEditor";
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

/* =========================================================
   TYPES
========================================================= */

type FieldType = "text" | "number" | "dropdown" | "boolean" | "file";

type TemplateField = {
  id: string;
  templateId: string;
  sectionId: string;
  key: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  optionsJson?: string | null;
  helpText?: string | null;
  orderIndex: number;
};

type TemplateSection = {
  id: string;
  templateId: string;
  title: string;
  orderIndex: number;
  fields?: TemplateField[];
};

type Template = {
  id: string;
  organisationId: string;
  name: string;
  description?: string | null;
  dwtProfileJson?: string | null;
  version: number;
  isActive: boolean;
  isLocked: boolean;
  createdByUserId: string;
  createdAt?: Date | string | null;
  sections?: TemplateSection[];
};

type Message = {
  type: "success" | "error";
  text: string;
};

/* =========================================================
   HELPERS
========================================================= */

function getFieldTypeLabel(type: string) {
  switch (type) {
    case "text":
      return "Text";

    case "number":
      return "Number";

    case "dropdown":
      return "Dropdown";

    case "boolean":
      return "Yes / No";

    case "file":
      return "File Upload";

    default:
      return type;
  }
}

function getFieldTypeClass(type: string) {
  switch (type) {
    case "text":
      return "border-blue-200 bg-blue-50 text-blue-700";

    case "number":
      return "border-purple-200 bg-purple-50 text-purple-700";

    case "dropdown":
      return "border-orange-200 bg-orange-50 text-orange-700";

    case "boolean":
      return "border-green-200 bg-green-50 text-green-700";

    case "file":
      return "border-black bg-black text-white";

    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

function getTotalFields(sections: TemplateSection[]) {
  return sections.reduce(
    (total, section) => total + (section.fields?.length ?? 0),
    0,
  );
}

function getRequiredFields(sections: TemplateSection[]) {
  return sections.reduce(
    (total, section) =>
      total + (section.fields?.filter((field) => field.required).length ?? 0),
    0,
  );
}

/* =========================================================
   SECTION CARD
========================================================= */

function SortableSection({
  section,
  template,
  isSelected,
  onSelectSection,
  onAddField,
  onDeleteSection,
}: {
  section: TemplateSection;
  template: Template;
  isSelected: boolean;
  onSelectSection: (sectionId: string) => void;
  onAddField: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: section.id });

  const fieldCount = section.fields?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-[1.35rem] border p-4 shadow-sm transition ${
        isSelected
          ? "border-orange-300 bg-orange-50 shadow-orange-100"
          : "border-black/10 bg-white hover:border-orange-200 hover:shadow-md"
      }`}
    >
      <button
        type="button"
        onClick={() => onSelectSection(section.id)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-3">
          {!template.isLocked && (
            <div
              {...attributes}
              {...listeners}
              className="mt-0.5 shrink-0 cursor-grab rounded-xl border border-black/10 bg-[#fbfaf7] px-2.5 py-2 text-xs text-black/35 active:cursor-grabbing"
              title="Drag section"
            >
              ☰
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-black">
              {section.title}
            </p>

            <p className="mt-1 text-xs text-black/40">
              {fieldCount} field{fieldCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </button>

      {!template.isLocked && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-black/10 pt-4">
          <button
            type="button"
            onClick={() => onAddField(section.id)}
            className="rounded-full bg-black px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
          >
            + Field
          </button>

          <button
            type="button"
            onClick={() => onDeleteSection(section.id)}
            className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   FIELD CARD
========================================================= */

function SortableField({
  field,
  template,
  isSelected,
  onDeleteField,
  onSelect,
}: {
  field: TemplateField;
  template: Template;
  isSelected: boolean;
  onDeleteField: (fieldId: string) => void;
  onSelect: (field: TemplateField) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-2xl border p-4 shadow-sm transition ${
        isSelected
          ? "border-orange-300 bg-orange-50"
          : "border-black/10 bg-white hover:border-orange-200 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3">
          {!template.isLocked && (
            <div
              {...attributes}
              {...listeners}
              className="mt-1 cursor-grab rounded-lg border border-black/10 bg-[#fbfaf7] px-2 py-1 text-xs text-black/35 active:cursor-grabbing"
              title="Drag field"
            >
              ☰
            </div>
          )}

          <button
            type="button"
            onClick={() => !template.isLocked && onSelect(field)}
            className={`min-w-0 text-left ${
              template.isLocked ? "cursor-default" : "cursor-pointer"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-black">{field.label}</p>

              {field.required && (
                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-700">
                  Required
                </span>
              )}
            </div>

            <p className="mt-1 font-mono text-xs text-black/35">{field.key}</p>

            {field.helpText && (
              <p className="mt-2 text-xs leading-5 text-black/45">
                {field.helpText}
              </p>
            )}
          </button>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${getFieldTypeClass(
              field.fieldType,
            )}`}
          >
            {getFieldTypeLabel(field.fieldType)}
          </span>

          {!template.isLocked && (
            <button
              type="button"
              onClick={() => onDeleteField(field.id)}
              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN EDITOR
========================================================= */

export default function TemplateEditorClient({
  template,
}: {
  template: Template;
}) {
  const router = useRouter();

  const [showAddSection, setShowAddSection] = useState(false);

  const [showAddFieldForSection, setShowAddFieldForSection] = useState<
    string | null
  >(null);

  const [selectedField, setSelectedField] = useState<TemplateField | null>(
    null,
  );

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    template.sections?.[0]?.id ?? null,
  );

  const [message, setMessage] = useState<Message | null>(null);
  const [locking, setLocking] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  const orderedSections = useMemo(() => {
    return [...(template.sections ?? [])].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
  }, [template.sections]);

  const totalSections = orderedSections.length;
  const totalFields = getTotalFields(orderedSections);
  const requiredFields = getRequiredFields(orderedSections);

  async function deleteSection(sectionId: string) {
    if (template.isLocked) return;

    const section = orderedSections.find((item) => item.id === sectionId);
    const fieldCount = section?.fields?.length ?? 0;

    const confirmed = confirm(
      fieldCount > 0
        ? `Delete this section and its ${fieldCount} field${
            fieldCount === 1 ? "" : "s"
          }?`
        : "Delete this section?",
    );

    if (!confirmed) return;

    setMessage(null);

    try {
      await deleteSectionAction(sectionId);

      if (selectedSectionId === sectionId) {
        setSelectedSectionId(null);
      }

      router.refresh();
    } catch (error: any) {
      console.error("Delete section error:", error);

      setMessage({
        type: "error",
        text: error?.message || "Failed to delete section.",
      });
    }
  }

  async function deleteField(fieldId: string) {
    if (template.isLocked) return;

    const confirmed = confirm("Delete this field?");
    if (!confirmed) return;

    setMessage(null);

    try {
      await deleteFieldAction(fieldId);

      if (selectedField?.id === fieldId) {
        setSelectedField(null);
      }

      router.refresh();
    } catch (error: any) {
      console.error("Delete field error:", error);

      setMessage({
        type: "error",
        text: error?.message || "Failed to delete field.",
      });
    }
  }

  async function handleSectionDragEnd(event: any) {
    if (template.isLocked) return;

    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = orderedSections.findIndex((section) => {
      return section.id === active.id;
    });

    const newIndex = orderedSections.findIndex((section) => {
      return section.id === over.id;
    });

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedSections, oldIndex, newIndex);

    try {
      await reorderSectionsAction(
        template.id,
        newOrder.map((section) => section.id),
      );

      router.refresh();
    } catch (error: any) {
      console.error("Reorder sections error:", error);

      setMessage({
        type: "error",
        text: error?.message || "Failed to reorder sections.",
      });
    }
  }

  async function toggleLock() {
    if (locking) return;

    setLocking(true);
    setMessage(null);

    try {
      await toggleTemplateLockAction(template.id);

      setMessage({
        type: "success",
        text: template.isLocked
          ? "Template unlocked. Editing is now available."
          : "Template locked. Editing is now protected.",
      });

      router.refresh();
    } catch (error: any) {
      console.error("Toggle template lock error:", error);

      setMessage({
        type: "error",
        text: error?.message || "Failed to update template lock state.",
      });
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* BUILDER HEADER */}
      <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Builder Workspace
            </p>

            <h2 className="mt-2 text-2xl font-semibold text-black">
              Configure sections and fields
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-black/45">
              Build the listing form structure from here. Add sections first,
              then add fields inside each section.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleLock}
            disabled={locking}
            className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              template.isLocked
                ? "bg-black text-orange-400 hover:bg-orange-500 hover:text-black"
                : "bg-orange-500 text-black hover:bg-orange-400"
            }`}
          >
            {locking
              ? "Updating..."
              : template.isLocked
                ? "Unlock Template"
                : "Lock Template"}
          </button>
        </div>
      </section>

      {/* MESSAGE */}
      {message && (
        <section
          className={`rounded-3xl border p-5 text-sm shadow-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </section>
      )}

      {/* CLIENT-SIDE METRICS */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <MetricCard label="Sections" value={totalSections} />
        <MetricCard label="Fields" value={totalFields} />
        <MetricCard label="Required Fields" value={requiredFields} />
        <MetricCard label="Version" value={template.version} />
      </section>

      {/* EMPTY NOTICE */}
      {totalSections === 0 && !template.isLocked && (
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-orange-800 shadow-sm">
          <p className="text-sm font-semibold">
            Start this template by adding your first section.
          </p>

          <p className="mt-2 text-sm leading-6">
            Sections are the building blocks of the listing form. For example,
            you might create sections for Waste Details, Collection Site,
            Hazard Information, Photos or Pricing.
          </p>
        </section>
      )}

      {/* LOCK NOTICE */}
      {template.isLocked && (
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <p className="text-sm font-semibold text-orange-800">
            This template is locked.
          </p>

          <p className="mt-2 text-sm leading-6 text-orange-700">
            Locked templates protect historical listing records and prevent
            accidental structure changes. Unlock only if you are certain this
            template is safe to edit.
          </p>
        </section>
      )}
<TemplateDwtProfileEditor
  templateId={template.id}
  templateVersion={template.version}
  initialProfileJson={template.dwtProfileJson ?? null}
  isLocked={template.isLocked}
/>
      {/* BUILDER GRID */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* LEFT: SECTIONS */}
        <aside className="min-w-0 space-y-4">
          <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm xl:sticky xl:top-28">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-black/10 pb-5">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Structure
                </p>

                <h2 className="mt-2 text-lg font-semibold text-black">
                  Sections
                </h2>

                <p className="mt-1 text-sm leading-6 text-black/45">
                  Group related listing fields without crowding the main builder.
                </p>
              </div>

              {!template.isLocked && (
                <button
                  type="button"
                  onClick={() => setShowAddSection(true)}
                  className="shrink-0 rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-orange-400"
                >
                  + Add
                </button>
              )}
            </div>

            {orderedSections.length === 0 ? (
              <EmptyPanel
                title="No sections yet"
                text="Add your first section to begin structuring this template."
              />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSectionDragEnd}
              >
                <SortableContext
                  items={orderedSections.map((section) => section.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {orderedSections.map((section) => (
                      <SortableSection
                        key={section.id}
                        section={section}
                        template={template}
                        isSelected={selectedSectionId === section.id}
                        onSelectSection={setSelectedSectionId}
                        onAddField={setShowAddFieldForSection}
                        onDeleteSection={deleteSection}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </aside>

        {/* RIGHT: BUILDER + SETTINGS */}
        <div className="min-w-0 space-y-6">
          <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 border-b border-black/10 pb-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Field Builder
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  Template Fields
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
                  Drag fields inside each section. Select a field to edit settings below the builder.
                </p>
              </div>

              <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black/55">
                {totalFields} field{totalFields === 1 ? "" : "s"} across {totalSections} section
                {totalSections === 1 ? "" : "s"}
              </div>
            </div>

            {orderedSections.length === 0 ? (
              <EmptyPanel
                title="No sections available"
                text="Create a section first. Fields must belong to a section."
              />
            ) : (
              <div className="space-y-6">
                {orderedSections.map((section) => {
                  const orderedFields = [...(section.fields ?? [])].sort(
                    (a: TemplateField, b: TemplateField) =>
                      a.orderIndex - b.orderIndex,
                  );

                  async function handleFieldDragEnd(event: any) {
                    if (template.isLocked) return;

                    const { active, over } = event;

                    if (!over || active.id === over.id) return;

                    const oldIndex = orderedFields.findIndex((field) => {
                      return field.id === active.id;
                    });

                    const newIndex = orderedFields.findIndex((field) => {
                      return field.id === over.id;
                    });

                    if (oldIndex === -1 || newIndex === -1) return;

                    const newOrder = arrayMove(
                      orderedFields,
                      oldIndex,
                      newIndex,
                    );

                    try {
                      await reorderFieldsAction(
                        section.id,
                        newOrder.map((field) => field.id),
                      );

                      router.refresh();
                    } catch (error: any) {
                      console.error("Reorder fields error:", error);

                      setMessage({
                        type: "error",
                        text: error?.message || "Failed to reorder fields.",
                      });
                    }
                  }

                  return (
                    <div
                      key={section.id}
                      className={`rounded-[1.75rem] border p-5 transition ${
                        selectedSectionId === section.id
                          ? "border-orange-200 bg-orange-50/50"
                          : "border-black/10 bg-[#fbfaf7]"
                      }`}
                    >
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => setSelectedSectionId(section.id)}
                          className="min-w-0 text-left"
                        >
                          <h3 className="truncate text-base font-semibold text-black">
                            {section.title}
                          </h3>

                          <p className="mt-1 text-xs text-black/40">
                            {orderedFields.length} field
                            {orderedFields.length === 1 ? "" : "s"}
                          </p>
                        </button>

                        {!template.isLocked && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowAddFieldForSection(section.id)
                            }
                            className="shrink-0 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                          >
                            + Add Field
                          </button>
                        )}
                      </div>

                      {orderedFields.length === 0 ? (
                        <EmptyPanel
                          title="No fields in this section"
                          text="Add a field to start capturing structured listing data."
                          compact
                        />
                      ) : (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleFieldDragEnd}
                        >
                          <SortableContext
                            items={orderedFields.map((field) => field.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-3">
                              {orderedFields.map((field) => (
                                <SortableField
                                  key={field.id}
                                  field={field}
                                  template={template}
                                  isSelected={selectedField?.id === field.id}
                                  onDeleteField={deleteField}
                                  onSelect={setSelectedField}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {selectedField && !template.isLocked ? (
              <FieldSettingsPanel
                field={selectedField}
                onClose={() => setSelectedField(null)}
              />
            ) : (
              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Field Settings
                </p>

                <h2 className="mt-2 text-lg font-semibold text-black">
                  {template.isLocked ? "Settings locked" : "Select a field"}
                </h2>

                <p className="mt-2 text-sm leading-6 text-black/45">
                  {template.isLocked
                    ? "Unlock the template before editing field settings."
                    : "Select any field in the builder to edit its label, type, options, required state and help text."}
                </p>
              </div>
            )}

            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Builder Guidance
              </p>

              <h3 className="mt-2 text-base font-semibold text-black">
                Keep templates structured
              </h3>

              <ul className="mt-4 space-y-3 text-sm leading-6 text-black/50">
                <li>• Use sections to group related operational data.</li>
                <li>• Mark compliance-critical fields as required.</li>
                <li>• Use dropdowns where fixed options are better than text.</li>
                <li>• Lock templates once they are used in live workflows.</li>
              </ul>
            </div>
          </section>
        </div>
      </section>

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
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-[#fbfaf7] p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">
        {label}
      </p>

      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}

function EmptyPanel({
  title,
  text,
  compact = false,
}: {
  title: string;
  text: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-black/20 bg-white text-center ${
        compact ? "p-5" : "p-8"
      }`}
    >
      <p className="text-sm font-semibold text-black">{title}</p>

      <p className="mt-2 text-sm leading-6 text-black/45">{text}</p>
    </div>
  );
}