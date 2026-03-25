import StatusPanel from "@/components/status-panel";

const commands = [
  "npm run claw:init",
  "npm run dev",
  "open http://localhost:3000",
];

const nextJsNotes = [
  "Keep ClawJS usage on the server side. The starter uses a Node.js route handler at /api/claw/status.",
  "Use @clawjs/claw inside server helpers, route handlers, or server actions. Do not import it into client components.",
  "Start with the demo adapter for a zero-config local flow, then switch scripts and src/lib/claw.ts to openclaw.",
];

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[32px] border border-[var(--panel-border)] bg-[var(--panel)] p-8 shadow-[0_20px_80px_rgba(61,47,24,0.08)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
              Create Claw App
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold md:text-5xl">
              __APP_TITLE__ ships with Next.js and a working ClawJS server edge.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
              This starter keeps the front end simple and shows the exact server-side seam where ClawJS
              belongs in a Next.js app: one helper, one route handler, one local workspace bootstrap script.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {commands.map((command) => (
                <div
                  key={command}
                  className="rounded-2xl border border-[var(--panel-border)] bg-white/70 px-4 py-4"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                    Command
                  </p>
                  <code className="mt-2 block text-sm font-semibold text-[var(--foreground)]">
                    {command}
                  </code>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-[#1e2430] bg-[#1e2430] p-6 text-[#f8f4ea] shadow-[0_20px_80px_rgba(17,24,39,0.18)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#8dd3c7]">
              Server Hook
            </p>
            <pre className="mt-4 overflow-x-auto text-sm leading-7 text-[#e5ddd0]">
              <code>{`import { Claw } from "@clawjs/claw";

const claw = await Claw({
  runtime: { adapter: "demo" },
  workspace: {
    appId: "__APP_SLUG__",
    workspaceId: "__APP_SLUG__",
    agentId: "__APP_SLUG__",
    rootDir: process.cwd(),
  },
});`}</code>
            </pre>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[32px] border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-[0_20px_80px_rgba(61,47,24,0.08)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--accent)]">
              Next.js Integration
            </p>
            <div className="mt-5 space-y-4">
              {nextJsNotes.map((note, index) => (
                <div key={note} className="flex gap-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-7 text-[var(--muted)]">{note}</p>
                </div>
              ))}
            </div>
          </div>

          <StatusPanel />
        </section>
      </div>
    </main>
  );
}
