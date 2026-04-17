"use client";

import { useState } from "react";

export function BetaFeedbackForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("Bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [responseMessage, setResponseMessage] = useState(
    "Send bugs, confusing flows, and feature requests directly from here."
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setResponseMessage("");

    const response = await fetch("/api/beta/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, email, category, message }),
    }).catch(() => null);

    const result = await response?.json().catch(() => null);

    if (!response?.ok) {
      setStatus("error");
      setResponseMessage(result?.message ?? "Could not send feedback right now.");
      return;
    }

    setStatus("success");
    setResponseMessage(result?.message ?? "Feedback sent.");
    setName("");
    setEmail("");
    setCategory("Bug");
    setMessage("");
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-panel/80 p-6">
      <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/65">
        Tester feedback
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-white">Report what you found</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-soft">
        The best feedback is specific: what page you were on, what you expected, what actually
        happened, and whether it blocked you.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="beta-name" className="mb-2 block text-sm font-medium text-white/70">
              Name
            </label>
            <input
              id="beta-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              className="min-h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none transition placeholder:text-soft focus:border-red"
            />
          </div>
          <div>
            <label htmlFor="beta-email" className="mb-2 block text-sm font-medium text-white/70">
              Email
            </label>
            <input
              id="beta-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="min-h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none transition placeholder:text-soft focus:border-red"
            />
          </div>
        </div>

        <div>
          <label htmlFor="beta-category" className="mb-2 block text-sm font-medium text-white/70">
            Feedback type
          </label>
          <select
            id="beta-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="min-h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none transition focus:border-red"
          >
            <option>Bug</option>
            <option>UX feedback</option>
            <option>Feature request</option>
            <option>Data issue</option>
          </select>
        </div>

        <div>
          <label htmlFor="beta-message" className="mb-2 block text-sm font-medium text-white/70">
            What happened?
          </label>
          <textarea
            id="beta-message"
            required
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={6}
            placeholder="Tell us what you were doing, what looked wrong, and what you expected instead."
            className="w-full rounded-3xl border border-white/15 bg-black/30 px-4 py-4 text-white outline-none transition placeholder:text-soft focus:border-red"
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="min-h-12 rounded-full bg-red px-6 text-sm font-semibold text-white transition hover:bg-[#c21d38] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading" ? "Sending..." : "Send feedback"}
        </button>

        <p className={`text-sm ${status === "error" ? "text-red-300" : "text-white/70"}`}>
          {responseMessage}
        </p>
      </form>
    </div>
  );
}
