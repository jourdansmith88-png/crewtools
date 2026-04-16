import { logoutAction } from "./actions";

export default function BetaPage() {
  return (
    <main className="min-h-screen bg-hero">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-line bg-white/5 px-4 py-3 backdrop-blur sm:px-5">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-white/75">
            CrewTools Beta
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/5"
            >
              Log out
            </button>
          </form>
        </header>

        <section className="py-16">
          <div className="rounded-[2rem] border border-line bg-white/5 p-6 shadow-glow backdrop-blur sm:p-8">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-white/70">
              Private beta
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Welcome to CrewTools beta
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-soft sm:text-lg">
              This area is ready for private release notes, tester onboarding, app links,
              feedback instructions, or direct beta-download links once you are ready.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-panel/80 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/55">
                  Beta access
                </p>
                <h2 className="mt-3 text-xl font-semibold text-white">Private tester hub</h2>
                <p className="mt-2 text-sm leading-7 text-soft">
                  Share instructions, current build notes, or access links here.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-panel/80 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/55">
                  Feedback
                </p>
                <h2 className="mt-3 text-xl font-semibold text-white">Fast tester loop</h2>
                <p className="mt-2 text-sm leading-7 text-soft">
                  Point testers to your email, form, or Discord as soon as that workflow is ready.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-panel/80 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/55">
                  Next step
                </p>
                <h2 className="mt-3 text-xl font-semibold text-white">Wire in the app</h2>
                <p className="mt-2 text-sm leading-7 text-soft">
                  Later, this page can link directly into the pilot tool or mobile beta builds.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
