"use client";

import { useState, useCallback, useEffect } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Plus, Clock, Play, Trash2, Loader2, RefreshCw,
  Calendar, ChevronDown, ChevronUp, CheckCircle2, XCircle,
} from "lucide-react";

/* ── Types (mirror demo-store) ── */
interface Routine {
  id: string;
  label: string;
  description: string;
  schedule: string;
  channel: string;
  prompt: string;
  enabled: boolean;
  lastRun?: number;
  createdAt: number;
  updatedAt: number;
}

interface RoutineExecution {
  id: string;
  routineId: string;
  status: "success" | "failure" | "running";
  startedAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

/* ── Schedule presets ── */
const CRON_PRESETS = [
  { label: "Every 5 min", cron: "*/5 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Daily at 9am", cron: "0 9 * * *" },
  { label: "Weekly Monday", cron: "0 9 * * 1" },
];

/* ── Channel options ── */
const CHANNELS = [
  { value: "chat", label: "Chat", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { value: "whatsapp", label: "WhatsApp", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { value: "telegram", label: "Telegram", color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  { value: "email", label: "Email", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
];

/* ── Human-readable cron ── */
function describeCron(cron: string): string {
  const map: Record<string, string> = {
    "*/5 * * * *": "Every 5 minutes",
    "0 * * * *": "Every hour",
    "0 9 * * *": "Daily at 9:00 AM",
    "0 9 * * 1": "Weekly on Monday at 9:00 AM",
    "*/15 * * * *": "Every 15 minutes",
    "0 0 * * *": "Daily at midnight",
    "0 */2 * * *": "Every 2 hours",
    "0 9 * * 1-5": "Weekdays at 9:00 AM",
  };
  return map[cron] || cron;
}

/* ── Relative time ── */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function channelMeta(ch: string) {
  return CHANNELS.find((c) => c.value === ch) || CHANNELS[0];
}

export default function RoutinesPage() {
  const { messages } = useLocale();

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [executions, setExecutions] = useState<RoutineExecution[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  /* Form state */
  const [fLabel, setFLabel] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fCron, setFCron] = useState("0 9 * * *");
  const [fChannel, setFChannel] = useState("chat");
  const [fPrompt, setFPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  /* ── Fetch ── */
  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/routines");
      if (res.ok) {
        const data = await res.json();
        setRoutines(data.routines ?? []);
        setExecutions(data.executions ?? []);
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) loadData();
  }, [loaded, loadData]);

  /* Auto-refresh to pick up execution completions */
  useEffect(() => {
    if (running.size === 0) return;
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [running.size, loadData]);

  /* ── Create routine ── */
  const createRoutine = async () => {
    if (!fLabel.trim() || !fPrompt.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: fLabel.trim(),
          description: fDesc.trim(),
          schedule: fCron,
          channel: fChannel,
          prompt: fPrompt.trim(),
        }),
      });
      if (res.ok) {
        setFLabel(""); setFDesc(""); setFCron("0 9 * * *"); setFChannel("chat"); setFPrompt("");
        setShowForm(false);
        await loadData();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  /* ── Toggle enabled ── */
  const toggleEnabled = async (routine: Routine) => {
    // Optimistic update
    setRoutines((prev) => prev.map((r) => r.id === routine.id ? { ...r, enabled: !r.enabled } : r));
    try {
      await fetch("/api/routines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: routine.id, enabled: !routine.enabled }),
      });
    } catch {
      setRoutines((prev) => prev.map((r) => r.id === routine.id ? { ...r, enabled: routine.enabled } : r));
    }
  };

  /* ── Run now ── */
  const runNow = async (id: string) => {
    setRunning((prev) => new Set(prev).add(id));
    try {
      await fetch("/api/routines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, runNow: true }),
      });
      await loadData();
    } catch { /* ignore */ }
    // Remove from running after a delay to let simulation complete
    setTimeout(() => {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      loadData();
    }, 5000);
  };

  /* ── Delete ── */
  const deleteRoutine = async (id: string) => {
    setDeleting(id);
    try {
      await fetch("/api/routines", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadData();
    } catch { /* ignore */ }
    setDeleting(null);
  };

  return (
    <div className="h-full overflow-y-auto" data-testid="routines-page">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              {messages.nav.routines}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Scheduled prompts that run automatically on your channels.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              data-testid="routines-new-button"
              onClick={() => setShowForm(!showForm)}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Routine
            </button>
            <button
              onClick={loadData}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Inline creation form ── */}
        {showForm && (
          <div className="mb-5 bg-card border border-border rounded-xl p-5">
            <div className="text-[13px] font-medium text-foreground mb-4">Create a new routine</div>

            {/* Label */}
            <div className="mb-3">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Label</label>
              <input
                data-testid="routines-label-input"
                type="text"
                value={fLabel}
                onChange={(e) => setFLabel(e.target.value)}
                placeholder="e.g. Daily standup summary"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
              />
            </div>

            {/* Description */}
            <div className="mb-3">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Description</label>
              <input
                data-testid="routines-description-input"
                type="text"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="Optional short description"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
              />
            </div>

            {/* Schedule */}
            <div className="mb-3">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Schedule (cron)</label>
              <input
                data-testid="routines-schedule-input"
                type="text"
                value={fCron}
                onChange={(e) => setFCron(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors mb-2"
              />
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.cron}
                    onClick={() => setFCron(p.cron)}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
                      fCron === p.cron
                        ? "bg-foreground text-primary-foreground border-foreground"
                        : "bg-muted text-muted-foreground border-border hover:text-foreground hover:border-foreground/20"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel */}
            <div className="mb-3">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Channel</label>
              <select
                data-testid="routines-channel-select"
                value={fChannel}
                onChange={(e) => setFChannel(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
              >
                {CHANNELS.map((ch) => (
                  <option key={ch.value} value={ch.value}>{ch.label}</option>
                ))}
              </select>
            </div>

            {/* Prompt */}
            <div className="mb-4">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Prompt</label>
              <textarea
                data-testid="routines-prompt-input"
                value={fPrompt}
                onChange={(e) => setFPrompt(e.target.value)}
                placeholder="What should the agent do each time this routine runs?"
                rows={3}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                data-testid="routines-create-button"
                onClick={createRoutine}
                disabled={!fLabel.trim() || !fPrompt.trim() || saving}
                className="px-4 py-2 bg-foreground text-primary-foreground text-[12px] font-medium rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Create Routine
              </button>
              <button
                data-testid="routines-cancel-button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Routines list ── */}
        <div className="mb-6">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Routines ({routines.length})
          </div>

          {!loaded ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Loader2 className="w-5 h-5 text-muted-foreground mx-auto animate-spin" />
            </div>
          ) : routines.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-[13px] text-muted-foreground mb-1">No routines yet</p>
              <p className="text-[11px] text-muted-foreground/60">Create one to schedule automated prompts.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
              {routines.map((routine) => {
                const ch = channelMeta(routine.channel);
                const isRunning = running.has(routine.id);
                const isDeleting = deleting === routine.id;

                return (
                  <div key={routine.id} data-testid="routine-item" data-routine-id={routine.id} className="px-4 py-3.5 group hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                        routine.enabled
                          ? "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20"
                          : "bg-muted border-border/50"
                      }`}>
                        <Clock className={`w-4 h-4 ${routine.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] font-medium text-foreground truncate">{routine.label}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium flex-shrink-0 ${ch.color}`}>
                            {ch.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {describeCron(routine.schedule)}
                          </span>
                          {routine.lastRun && (
                            <span>Last run: {timeAgo(routine.lastRun)}</span>
                          )}
                        </div>
                        {routine.description && (
                          <p className="text-[11px] text-muted-foreground/70 mt-1 truncate">{routine.description}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Run Now */}
                        <button
                          data-testid="routine-run-button"
                          onClick={() => runNow(routine.id)}
                          disabled={isRunning || !routine.enabled}
                          className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
                          title="Run now"
                        >
                          {isRunning ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Delete */}
                        <button
                          data-testid="routine-delete-button"
                          onClick={() => deleteRoutine(routine.id)}
                          disabled={isDeleting}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                          title="Delete routine"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Enable/Disable toggle */}
                        <button
                          data-testid="routine-toggle-button"
                          onClick={() => toggleEnabled(routine)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                            routine.enabled ? "bg-emerald-500" : "bg-border-hover"
                          }`}
                          title={routine.enabled ? "Disable" : "Enable"}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out mt-0.5 ${
                            routine.enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                          }`} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Execution history ── */}
        {executions.length > 0 && (
          <div>
            <button
              data-testid="routines-history-toggle"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1 hover:text-foreground transition-colors"
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Recent Executions ({executions.length})
            </button>

            {showHistory && (
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {executions.slice(0, 20).map((exec) => {
                  const routine = routines.find((r) => r.id === exec.routineId);
                  return (
                    <div key={exec.id} className="flex items-center gap-3 px-4 py-2.5">
                      {/* Status icon */}
                      <div className="flex-shrink-0">
                        {exec.status === "success" && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                        {exec.status === "failure" && (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        {exec.status === "running" && (
                          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-medium text-foreground truncate">
                            {routine?.label ?? "Unknown routine"}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                            exec.status === "success"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : exec.status === "failure"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          }`}>
                            {exec.status}
                          </span>
                        </div>
                        {exec.error && (
                          <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5 truncate">{exec.error}</p>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {timeAgo(exec.startedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
