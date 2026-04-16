"use client";

import { useActionState } from "react";
import { loginAction } from "../app/beta/login/actions";

export function BetaLoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium text-white/70">
          Beta tester email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
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
          className="min-h-14 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none transition placeholder:text-soft focus:border-red"
          placeholder="Beta access password"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-14 w-full rounded-full bg-red px-6 text-sm font-semibold text-white transition hover:bg-[#c21d38] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Entering..." : "Enter beta"}
      </button>
      <p className={`text-sm ${state.error ? "text-red-300" : "text-white/70"}`}>
        {state.error ?? "Private beta access only."}
      </p>
    </form>
  );
}
