"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { replyToTicketAction } from "@/modules/support/tickets/actions/replyToTicket";
import { useToast } from "@/components/ui/use-toast";

export default function ReplyToTicketForm({
  ticketId,
  isPlatformAdmin,
}: {
  ticketId: string;
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [message, setMessage] =
    useState("");

  const [
    isInternalNote,
    setIsInternalNote,
  ] = useState(false);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const canSubmit =
    message.trim().length > 0 &&
    !isSubmitting;

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    if (!message.trim()) {
      return;
    }

    setIsSubmitting(true);

    const formData =
      new FormData();

    formData.append(
      "ticketId",
      ticketId,
    );

    formData.append(
      "message",
      message.trim(),
    );

    formData.append(
      "isInternalNote",
      isPlatformAdmin &&
        isInternalNote
        ? "true"
        : "false",
    );

    try {
      const result =
        await replyToTicketAction(
          null,
          formData,
        );

      if (result.success) {
        toast({
          title:
            isPlatformAdmin &&
            isInternalNote
              ? "Internal note saved"
              : "Reply sent",

          description:
            result.message,
        });

        setMessage("");
        setIsInternalNote(false);

        router.refresh();
      } else {
        toast({
          title:
            "Could not send reply",

          description:
            result.message,

          variant:
            "destructive",
        });
      }
    } catch (error) {
      console.error(error);

      toast({
        title:
          "Something went wrong",

        description:
          "Your reply could not be sent. Please try again.",

        variant:
          "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      <div className="rounded-3xl border border-black/10 bg-[#fbfaf7] p-5">
        <label
          htmlFor="support-message"
          className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-600"
        >
          Message
        </label>

        <textarea
          id="support-message"
          value={message}
          onChange={(e) =>
            setMessage(
              e.target.value,
            )
          }
          placeholder="Write your reply..."
          maxLength={5000}
          className="mt-4 min-h-[140px] w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-black outline-none transition placeholder:text-black/30 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
          rows={5}
        />

        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-xs text-black/35">
            {
              message.trim()
                .length
            }{" "}
            / 5,000 characters
          </p>

          <p className="text-xs text-black/35">
            Ticket ID:{" "}
            <span className="font-mono">
              {ticketId.length >
              10
                ? `${ticketId.slice(
                    0,
                    10,
                  )}...`
                : ticketId}
            </span>
          </p>
        </div>
      </div>

      {isPlatformAdmin && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 transition hover:border-yellow-300">
          <input
            type="checkbox"
            checked={
              isInternalNote
            }
            onChange={(e) =>
              setIsInternalNote(
                e.target.checked,
              )
            }
            className="mt-1 h-4 w-4 rounded border-yellow-300 text-orange-600 focus:ring-orange-500"
          />

          <span>
            <span className="block text-sm font-semibold text-yellow-900">
              Add as internal
              note
            </span>

            <span className="mt-1 block text-sm leading-6 text-yellow-800/70">
              Internal notes are
              hidden from the
              organisation and
              only visible to
              platform admins.
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-3 border-t border-black/5 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-black/45">
          Replies are saved to
          this ticket thread and
          visible to permitted
          users.
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting
            ? isInternalNote
              ? "Saving note..."
              : "Sending reply..."
            : isInternalNote
              ? "Save Internal Note"
              : "Send Reply"}
        </button>
      </div>
    </form>
  );
}