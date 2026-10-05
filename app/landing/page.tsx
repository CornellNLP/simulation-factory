import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 "
      />

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center relative">
        <div className="w-full max-w-lg flex flex-col items-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
            TrAuSt Toolkits
          </h1>
          <p className="mt-4 text-base text-neutral-400">
            Choose a toolkit to get started
          </p>

          <div className="mt-10 w-full flex flex-col gap-3">
            <Link
              href="/login"
              className="group rounded-xl border border-neutral-800 bg-neutral-900/40 backdrop-blur-sm px-6 py-5 flex items-center justify-between gap-4 text-left hover:border-neutral-600 hover:bg-neutral-900/70 transition-all duration-150"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold">Simulation Toolkit</span>
                <span className="text-sm text-neutral-400">
                  Build and test simulations, agents, mediators and assistants
                </span>
              </span>
              <span
                aria-hidden
                className="shrink-0 text-neutral-500 group-hover:text-neutral-200 group-hover:translate-x-0.5 transition-all duration-150"
              >
                &rarr;
              </span>
            </Link>

            <Link
              href="/login/mediator"
              className="group rounded-xl border border-neutral-800 bg-neutral-900/40 backdrop-blur-sm px-6 py-5 flex items-center justify-between gap-4 text-left hover:border-neutral-600 hover:bg-neutral-900/70 transition-all duration-150"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold">Mediator Toolkit</span>
                <span className="text-sm text-neutral-400">
                  Build and test civic discourse mediators
                </span>
              </span>
              <span
                aria-hidden
                className="shrink-0 text-neutral-500 group-hover:text-neutral-200 group-hover:translate-x-0.5 transition-all duration-150"
              >
                &rarr;
              </span>
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-neutral-800 px-8 py-5 text-center text-xs text-neutral-600 space-y-1 relative">
        <p>TrAuSt Toolkits</p>
        <p>The toolkits build in part on the ConvoKit and Deliberate Labs open source projects.</p>
      </footer>
    </div>
  )
}
