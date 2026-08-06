"use client";

import { useRef, useState, useTransition } from "react";

import {
  bookDemoAction,
  type BookDemoActionResult,
} from "@/modules/demo/actions/bookDemoAction";

export default function BookDemoForm() {
  const formRef = useRef<HTMLFormElement>(null);

  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookDemoActionResult | null>(null);

  return (
    <form
      ref={formRef}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          const response = await bookDemoAction(formData);

          setResult(response);

          if (response.ok) {
            formRef.current?.reset();
          }
        });
      }}
    >
      {/* Honeypot field */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-black/75">
            First name<span className="text-orange-600">*</span>
          </span>

          <input
            name="firstName"
            type="text"
            required
            autoComplete="given-name"
            className="mt-2 w-full rounded-xl border border-black/10 bg-[#f7f3ed]/60 px-4 py-3 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-black/75">
            Last name<span className="text-orange-600">*</span>
          </span>

          <input
            name="lastName"
            type="text"
            required
            autoComplete="family-name"
            className="mt-2 w-full rounded-xl border border-black/10 bg-[#f7f3ed]/60 px-4 py-3 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-bold text-black/75">
          Email<span className="text-orange-600">*</span>
        </span>

        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-black/10 bg-[#f7f3ed]/60 px-4 py-3 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
        />
      </label>

      <label className="block">
        <span className="text-sm font-bold text-black/75">Phone number</span>

        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          className="mt-2 w-full rounded-xl border border-black/10 bg-[#f7f3ed]/60 px-4 py-3 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
        />
      </label>

      <label className="block">
        <span className="text-sm font-bold text-black/75">
          Company name<span className="text-orange-600">*</span>
        </span>

        <input
          name="companyName"
          type="text"
          required
          autoComplete="organization"
          className="mt-2 w-full rounded-xl border border-black/10 bg-[#f7f3ed]/60 px-4 py-3 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-black/75">Company type</span>

          <select
            name="companyType"
            defaultValue=""
            className="mt-2 w-full rounded-xl border border-black/10 bg-[#f7f3ed]/60 px-4 py-3 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
          >
            <option value="">Select type</option>
            <option value="construction_demolition">
              Construction / demolition
            </option>
            <option value="waste_generator">Waste generator</option>
            <option value="waste_carrier">Waste carrier</option>
            <option value="waste_manager">Waste manager</option>
            <option value="skip_hire">Skip hire</option>
            <option value="transfer_station">Transfer station</option>
            <option value="broker_consultant">Broker / consultant</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-black/75">
            Organisation size
          </span>

          <select
            name="organisationSize"
            defaultValue=""
            className="mt-2 w-full rounded-xl border border-black/10 bg-[#f7f3ed]/60 px-4 py-3 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
          >
            <option value="">Select size</option>
            <option value="1-5">1–5 people</option>
            <option value="6-20">6–20 people</option>
            <option value="21-50">21–50 people</option>
            <option value="51-100">51–100 people</option>
            <option value="100+">100+ people</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-bold text-black/75">
          What would you like to see?
        </span>

        <textarea
          name="message"
          rows={4}
          placeholder="Tell us about your current waste tracking process, reporting needs, or what you want Waste X to help with."
          className="mt-2 w-full resize-none rounded-xl border border-black/10 bg-[#f7f3ed]/60 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/35 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
        />
      </label>

      {result && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {result.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-orange-500 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Sending request..." : "Book demo"}
      </button>

      <p className="text-center text-xs leading-5 text-black/45">
        Your details will only be used to respond to your Waste X demo request.
      </p>
    </form>
  );
}