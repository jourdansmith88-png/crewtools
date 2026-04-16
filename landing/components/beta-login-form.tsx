"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BetaLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("Private beta access only.");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const response = await fetch("/api/beta/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);

    const result = await response?.json().catch(() => null);

    if (!response?.ok) {
      setStatus("error");
      setMessage(result?.message ?? "Something went wrong. Please try again.");
      return;
    }

    router.push("/beta");
    router.refresh();
  }

  return (
    <div className="mt-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-white/70">
            Beta tester email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-14 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none transition placeholder:text-soft focus:border-red"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-white/70">
            Access password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-14 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none transition placeholder:text-soft focus:border-red"
            placeholder="Beta access password"
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="min-h-14 w-full rounded-full bg-red px-6 text-sm font-semibold text-white transition hover:bg-[#c21d38] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading" ? "Entering..." : "Enter beta"}
        </button>
        <p className={`text-sm ${status === "error" ? "text-red-300" : "text-white/70"}`}>
          {message}
        </p>
      </form>
    </div>
  );
}
