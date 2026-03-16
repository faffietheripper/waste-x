"use client";

import React, { useState } from "react";
import { deleteAccountAction } from "@/app/home/me/account/actions";

export default function ConfirmProfileDelete() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const openModal = () => {
    const dialog = document.getElementById(
      "delete-modal",
    ) as HTMLDialogElement | null;
    dialog?.showModal();
  };

  const closeModal = () => {
    const dialog = document.getElementById(
      "delete-modal",
    ) as HTMLDialogElement | null;
    dialog?.close();
  };

  const handleDelete = async () => {
    if (input === "delete-my-account") {
      try {
        await deleteAccountAction();
        setError("");
        window.location.href = "/";
      } catch {
        setError("Failed to delete account. Please try again.");
      }
    } else {
      setError('You must type "delete-my-account" to confirm deletion.');
    }
  };

  return (
    <div>
      <button
        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        onClick={openModal}
      >
        Delete Account
      </button>

      <dialog id="delete-modal" className="rounded-lg p-6 bg-white shadow-md">
        <h2 className="text-xl font-bold mb-4">Confirm Account Deletion</h2>

        <p className="mb-4">
          Please type <span className="font-bold">"delete-my-account"</span> to
          confirm deletion. This action cannot be undone.
        </p>

        <input
          type="text"
          placeholder="Type here"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full border p-2 rounded mb-4"
        />

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex justify-end gap-4">
          <button
            className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
            onClick={closeModal}
          >
            Cancel
          </button>

          <button
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </dialog>
    </div>
  );
}
