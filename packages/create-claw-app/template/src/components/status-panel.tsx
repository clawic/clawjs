"use client";

import { useEffect, useState } from "react";

interface CapabilityState {
  supported: boolean;
  status: string;
}

interface StatusPayload {
  ok: boolean;
  initialized: boolean;
  runtime: {
    adapter: string;
    runtimeName: string;
    cliAvailable: boolean;
    version?: string | null;
    capabilityMap?: Record<string, CapabilityState>;
  };
  manifestPath?: string;
  workspace?: {
    appId: string;
    workspaceId: string;
    agentId: string;
  };
  error?: string;
}

type RequestState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; payload: StatusPayload };

function countSupportedCapabilities(capabilityMap?: Record<string, CapabilityState>): number {
  if (!capabilityMap) return 0;
  return Object.values(capabilityMap).filter((capability) => capability.supported).length;
}

export default function StatusPanel() {
  const [state, setState] = useState<RequestState>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/claw/status", { cache: "no-store" });
        const payload = (await response.json()) as StatusPayload;
        if (!active) return;

        if (!response.ok || !payload.ok) {
          setState({ kind: "error", message: payload.error ?? "Failed to load Claw status." });
          return;
        }

        setState({ kind: "ready", payload });
      } catch (error) {
        if (!active) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load Claw status.",
        });
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded-[32px] border border-[var(--panel-border)] bg-[#fffdf9] p-6 shadow-[0_20px_80px_rgba(61,47,24,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--accent)]">
            Live Status
          </p>
          <h2 className="mt-2 text-2xl font-semibold">ClawJS inside Next.js</h2>
        </div>
        <div className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          api/claw/status
        </div>
      </div>

      {state.kind === "loading" ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--panel-border)] px-4 py-8 text-sm text-[var(--muted)]">
          Loading runtime snapshot...
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="mt-6 rounded-2xl border border-[#d97706]/25 bg-[#fff7ed] px-4 py-4 text-sm leading-7 text-[#9a3412]">
          {state.message}
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Adapter</p>
              <p className="mt-2 text-xl font-semibold">{state.payload.runtime.adapter}</p>
            </div>
            <div className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Runtime</p>
              <p className="mt-2 text-xl font-semibold">{state.payload.runtime.runtimeName}</p>
            </div>
            <div className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Capabilities</p>
              <p className="mt-2 text-xl font-semibold">
                {countSupportedCapabilities(state.payload.runtime.capabilityMap)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#ecfdf5] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#047857]">
                CLI {state.payload.runtime.cliAvailable ? "available" : "missing"}
              </span>
              <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Workspace {state.payload.initialized ? "initialized" : "pending"}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
              {state.payload.workspace ? (
                <>
                  <p>
                    <span className="font-semibold text-[var(--foreground)]">Workspace:</span>{" "}
                    {state.payload.workspace.workspaceId}
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--foreground)]">Agent:</span>{" "}
                    {state.payload.workspace.agentId}
                  </p>
                  <p className="break-all">
                    <span className="font-semibold text-[var(--foreground)]">Manifest:</span>{" "}
                    {state.payload.manifestPath}
                  </p>
                </>
              ) : (
                <p>
                  Run <code className="font-semibold text-[var(--foreground)]">npm run claw:init</code> to create
                  the local ClawJS workspace files.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
