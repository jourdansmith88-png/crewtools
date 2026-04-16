"use client";

import { useState } from "react";

export function EarlyAccessForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const response = await fetch("/api/early-access", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    }).catch(() => null);

    const result = await response?.json().catch(() => null);

    if (!response?.ok) {
      setStatus("error");
      setMessage(result?.message ?? "Something went wrong. Please try again.");
      return;
    }

    setStatus("success");
    setMessage(result?.message ?? "You're on the list.");
    setEmail("");
  }

  return (
    <div className="mt-8">
      <form className="flex flex-col gap-3 sm:max-w-xl sm:flex-row" onSubmit={handleSubmit}>
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          className="min-h-14 flex-1 rounded-full border border-white/15 bg-black/30 px-5 text-white outline-none transition placeholder:text-soft focus:border-red"
          required
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="min-h-14 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading" ? "Joining..." : "Join"}
        </button>
      </form>
      <p
        className={`mt-3 text-sm ${
          status === "error" ? "text-red-300" : "text-white/70"
        }`}
      >
        {message || "We'll only use your email for CrewTools launch updates."}
      </p>
    </div>
  );
}
