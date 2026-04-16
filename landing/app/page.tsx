import Link from "next/link";
import { EarlyAccessForm } from "../components/early-access-form";

const previewCards = [
  {
    title: "Seniority clarity",
    copy: "See what you can hold, what moved, and what is close without digging through dense tables.",
  },
  {
    title: "Pilot-first decisions",
    copy: "Career projection and bidding tools designed to answer the next question fast on mobile.",
  },
];

function PhoneMockup({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[280px] rounded-[2rem] border border-white/15 bg-white/5 p-2 shadow-glow backdrop-blur">
      <div className="rounded-[1.5rem] border border-white/10 bg-[#0D1324] p-4">
        <div className="mx-auto mb-4 h-1.5 w-20 rounded-full bg-white/20" />
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-red/20 via-white/5 to-navy/30 p-4">
            <div className="mb-2 inline-flex rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-white/70">
              Screenshot
            </div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-soft">{copy}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-20 rounded-2xl border border-white/10 bg-white/5" />
            <div className="h-20 rounded-2xl border border-white/10 bg-white/5" />
            <div className="h-20 rounded-2xl border border-white/10 bg-white/5" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 h-2 w-24 rounded-full bg-white/10" />
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-white/10" />
              <div className="h-2 w-5/6 rounded-full bg-white/10" />
              <div className="h-2 w-2/3 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-hero">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-line bg-white/5 px-4 py-3 backdrop-blur sm:px-5">
          <div className="text-sm font-semibold tracking-[0.24em] text-white/75 uppercase">
            CrewTools
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/beta/login"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/5"
            >
              Beta Login
            </Link>
            <a
              href="#early-access"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/5"
            >
              Get Early Access
            </a>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-white/70 backdrop-blur">
              Built for pilots
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              CrewTools
            </h1>
            <p className="mt-4 text-2xl font-medium text-white sm:text-3xl">
              Everything you need. One place.
            </p>
            <p className="mt-6 max-w-xl text-base leading-8 text-soft sm:text-lg">
              Seniority, pay, and reserve tools — brought together in one clean,
              mobile-first experience for pilots.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                href="#early-access"
                className="inline-flex items-center justify-center rounded-full bg-red px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#c21d38]"
              >
                Get Early Access
              </a>
              <a
                href="#screenshots"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
              >
                See Screenshots
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-line bg-white/5 p-4 shadow-glow backdrop-blur sm:p-6">
            <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/70">
                  Mobile-first
                </span>
                <span className="text-sm text-soft">Dark mode by design</span>
              </div>
              <div className="mt-6 space-y-3">
                <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-navy/90 to-[#10192E] p-5">
                  <div className="text-sm text-white/70">Current focus</div>
                  <div className="mt-1 text-2xl font-semibold text-white">
                    Seniority, pay, reserve
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-white/10">
                    <div className="h-2 w-3/4 rounded-full bg-red" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-white/70">Track</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      Category movement
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-white/70">Plan</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      Career decisions
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="screenshots"
          className="rounded-[2rem] border border-line bg-white/5 px-5 py-12 backdrop-blur sm:px-8"
        >
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/55">
              Product preview
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              A better pilot toolkit
            </h2>
            <p className="mt-4 text-base leading-8 text-soft sm:text-lg">
              Clean category tracking, career projection, and decision-making
              tools.
            </p>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            {previewCards.map((card) => (
              <PhoneMockup key={card.title} title={card.title} copy={card.copy} />
            ))}
          </div>
        </section>

        <section
          id="early-access"
          className="mt-8 rounded-[2rem] border border-line bg-gradient-to-br from-white/5 to-white/[0.03] px-5 py-12 backdrop-blur sm:px-8"
        >
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/55">
              Early access
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Get early access
            </h2>
            <p className="mt-4 text-base leading-8 text-soft sm:text-lg">
              Be first to know when CrewTools launches.
            </p>
          </div>

          <EarlyAccessForm />
        </section>
      </div>
    </main>
  );
}
