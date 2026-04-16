import Link from "next/link";
import { BetaLoginForm } from "../../../components/beta-login-form";

export default function BetaLoginPage() {
  return (
    <main className="min-h-screen bg-hero">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-line bg-white/5 px-4 py-3 backdrop-blur sm:px-5">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-white/75">
            CrewTools Beta
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/5"
          >
            Back to site
          </Link>
        </header>

        <section className="mx-auto flex w-full max-w-xl flex-1 items-center py-16">
          <div className="w-full rounded-[2rem] border border-line bg-white/5 p-6 shadow-glow backdrop-blur sm:p-8">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-white/70">
              Beta access
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              CrewTools beta login
            </h1>
            <p className="mt-4 text-base leading-8 text-soft sm:text-lg">
              Sign in to access the beta tester area and private CrewTools updates.
            </p>
            <BetaLoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
