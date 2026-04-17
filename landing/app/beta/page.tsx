import Link from "next/link";
import { BetaFeedbackForm } from "../../components/beta-feedback-form";

const testingFocus = [
  "Run the seniority page on phone width and flag anything that still feels too dense.",
  "Open AE and Seniority popups, then confirm the close behavior and color logic feel obvious.",
  "Paste one clean timecard and one messy timecard into Pay and note where the audit still gets confused.",
];

const releaseNotes = [
  {
    date: "This week",
    title: "Beta login and private tester hub are live",
    copy: "CrewTools beta access is now protected and ready for a real tester loop.",
  },
  {
    date: "Latest product work",
    title: "Mobile tables and popup flows tightened up",
    copy: "Seniority and AE are easier to scan on mobile, with better modal behavior and less cramped data.",
  },
  {
    date: "Coming next",
    title: "Feedback routing and tester onboarding polish",
    copy: "Next pass is wiring beta feedback into your preferred inbox or webhook and adding direct app access.",
  },
];

export default function BetaPage() {
  return (
    <main className="min-h-screen bg-hero">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-line bg-white/5 px-4 py-3 backdrop-blur sm:px-5">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-white/75">
            CrewTools Beta
          </div>
          <form action="/api/beta/logout" method="post">
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
              This is the private tester loop for CrewTools: what to test, what changed, and
              where to send feedback once you find something worth fixing.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-panel/80 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/55">
                  Beta access
                </p>
                <h2 className="mt-3 text-xl font-semibold text-white">Private tester hub</h2>
                <p className="mt-2 text-sm leading-7 text-soft">
                  Keep testers focused on the right pages and current build priorities.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-panel/80 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/55">
                  Feedback
                </p>
                <h2 className="mt-3 text-xl font-semibold text-white">Fast tester loop</h2>
                <p className="mt-2 text-sm leading-7 text-soft">
                  Route bugs, confusing UX, and feature ideas into one clean capture point.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-panel/80 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/55">
                  Next step
                </p>
                <h2 className="mt-3 text-xl font-semibold text-white">Wire in the app</h2>
                <p className="mt-2 text-sm leading-7 text-soft">
                  Add direct app links, build notes, or a tester download flow here next.
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-6">
                <div className="rounded-[2rem] border border-white/10 bg-panel/80 p-6">
                  <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/65">
                    What to test now
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-white">This week’s tester focus</h2>
                  <div className="mt-5 space-y-3">
                    {testingFocus.map((item, index) => (
                      <div
                        key={item}
                        className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red text-sm font-semibold text-white">
                          {index + 1}
                        </div>
                        <p className="text-sm leading-7 text-soft">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/10 bg-panel/80 p-6">
                  <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/65">
                    Latest updates
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-white">Release notes</h2>
                  <div className="mt-5 space-y-4">
                    {releaseNotes.map((note) => (
                      <div key={note.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/50">
                          {note.date}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">{note.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-soft">{note.copy}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <BetaFeedbackForm />
            </div>

            <div className="mt-10">
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/5"
              >
                Back to site
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
