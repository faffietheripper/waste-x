// src/app/home/receiving/intake/[assignmentId]/WasteItemsEditor.tsx

"use client";

import WasteItemCard from "./WasteItemCard";

import {
  createDefaultWasteItem,
  type WasteItemFormState,
} from "./receiveMovementFormTypes";

type Props = {
  listingName: string;
  wasteItems: WasteItemFormState[];
  onChange: (items: WasteItemFormState[]) => void;
  issueMessagesFor: (keys: string[]) => string[];
  inputClassFor: (keys: string[]) => string;
};

export default function WasteItemsEditor({
  listingName,
  wasteItems,
  onChange,
  issueMessagesFor,
  inputClassFor,
}: Props) {
  function updateItem(index: number, nextItem: WasteItemFormState) {
    onChange(
      wasteItems.map((item, itemIndex) =>
        itemIndex === index ? nextItem : item,
      ),
    );
  }

  function removeItem(index: number) {
    onChange(wasteItems.filter((_, itemIndex) => itemIndex !== index));
  }

  function addItem() {
    onChange([...wasteItems, createDefaultWasteItem(listingName)]);
  }

  return (
    <section
      id="waste-items"
      className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-black">
            2. Waste received
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            Add the waste that was received. Include the correct EWC code,
            description, container details and weight for each item.
          </p>
        </div>

        <button
          type="button"
          onClick={addItem}
          className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          Add waste item
        </button>
      </div>

      <div className="mt-6 space-y-5">
        {wasteItems.length === 0 && (
          <div className="rounded-3xl border border-dashed border-black/15 bg-white p-6 text-sm text-black/45">
            No waste items have been added yet.
          </div>
        )}

        {wasteItems.map((item, index) => (
          <WasteItemCard
            key={item.id}
            item={item}
            index={index}
            canRemove={wasteItems.length > 1}
            onChange={(nextItem) => updateItem(index, nextItem)}
            onRemove={() => removeItem(index)}
            issueMessagesFor={issueMessagesFor}
            inputClassFor={inputClassFor}
          />
        ))}
      </div>
    </section>
  );
}