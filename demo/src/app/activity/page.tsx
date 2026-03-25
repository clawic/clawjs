"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  ChevronDown,
  Zap,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

interface ActivityEvent {
  id: string;
  event: string;
  capability: string;
  detail: string;
  timestamp: number;
  status: "success" | "failure" | "pending";
}

const CAPABILITY_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  channels:  { dot: "bg-blue-500",    bg: "bg-blue-500/8",    text: "text-blue-600 dark:text-blue-400" },
  memory:    { dot: "bg-purple-500",  bg: "bg-purple-500/8",  text: "text-purple-600 dark:text-purple-400" },
  scheduler: { dot: "bg-amber-500",   bg: "bg-amber-500/8",   text: "text-amber-600 dark:text-amber-400" },
  models:    { dot: "bg-emerald-500", bg: "bg-emerald-500/8", text: "text-emerald-600 dark:text-emerald-400" },
  skills:    { dot: "bg-cyan-500",    bg: "bg-cyan-500/8",    text: "text-cyan-600 dark:text-cyan-400" },
  providers: { dot: "bg-rose-500",    bg: "bg-rose-500/8",    text: "text-rose-600 dark:text-rose-400" },
};

const STATUS_BORDER: Record<string, string> = {
  success: "border-l-emerald-500",
  failure: "border-l-red-500",
  pending: "border-l-amber-500",
};

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDateKey(ts: number): string {
  return new Date(ts).toDateString();
}

function getDateLabel(ts: number): string {
  const today = new Date();
  const date = new Date(ts);
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/* ── Stat cards ── */
function StatsBar({ events }: { events: ActivityEvent[] }) {
  const total = events.length;
  const success = events.filter((e) => e.status === "success").length;
  const failures = events.filter((e) => e.status === "failure").length;
  const pending = events.filter((e) => e.status === "pending").length;
  const rate = total > 0 ? Math.round((success / total) * 100) : 0;

  const stats = [
    { label: "Total", value: total, icon: <Zap className="w-3.5 h-3.5" />, color: "text-foreground" },
    { label: "Success", value: `${rate}%`, icon: <TrendingUp className="w-3.5 h-3.5" />, color: "text-emerald-500" },
    { label: "Failures", value: failures, icon: <AlertCircle className="w-3.5 h-3.5" />, color: "text-red-500" },
    { label: "Pending", value: pending, icon: <Clock className="w-3.5 h-3.5" />, color: "text-amber-500" },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {stats.map((s) => (
        <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3">
          <div className={`flex items-center gap-1.5 mb-1 ${s.color}`}>
            {s.icon}
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {s.label}
            </span>
          </div>
          <span className={`text-xl font-semibold tabular-nums ${s.color}`}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Filter dropdown ── */
function FilterDropdown({
  label,
  value,
  options,
  onChange,
  testIdPrefix,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  testIdPrefix: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        data-testid={`${testIdPrefix}-trigger`}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${
          value !== "all"
            ? "border-foreground/20 bg-foreground/5 text-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/15"
        }`}
      >
        <span className="capitalize">{value === "all" ? label : value}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
            {options.map((opt) => (
              <button
                key={opt}
                data-testid={`${testIdPrefix}-${opt}`}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full text-left text-[12px] px-3 py-1.5 capitalize transition-colors ${
                  value === opt
                    ? "bg-foreground/5 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Event row ── */
function EventRow({ event }: { event: ActivityEvent }) {
  const capStyle = CAPABILITY_COLORS[event.capability] || {
    dot: "bg-muted-foreground",
    bg: "bg-muted",
    text: "text-muted-foreground",
  };
  const borderColor = STATUS_BORDER[event.status] || "border-l-border";

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 border-l-2 ${borderColor} rounded-r-lg hover:bg-muted/50 transition-colors`}
    >
      {/* Capability dot + status */}
      <div className="flex flex-col items-center gap-1.5 pt-0.5 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${capStyle.dot}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-foreground truncate">
            {event.event}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-px rounded-md ${capStyle.bg} ${capStyle.text} capitalize flex-shrink-0`}>
            {event.capability}
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-1">
          {event.detail}
        </p>
      </div>

      {/* Time + status icon */}
      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
        {event.status === "success" && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
        {event.status === "failure" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
        {event.status === "pending" && <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />}
        <span
          className="text-[11px] text-muted-foreground tabular-nums"
          title={formatTimestamp(event.timestamp)}
        >
          {formatTime(event.timestamp)}
        </span>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function ActivityPage() {
  const { messages } = useLocale();
  void messages;

  const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);
  const [capFilter, setCapFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity?limit=200");
      if (res.ok) {
        const data = (await res.json()) as { events: ActivityEvent[] };
        setAllEvents(data.events ?? []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const events = useMemo(() => {
    let filtered = allEvents;
    if (capFilter !== "all") filtered = filtered.filter((e) => e.capability === capFilter);
    if (statusFilter !== "all") filtered = filtered.filter((e) => e.status === statusFilter);
    return filtered;
  }, [allEvents, capFilter, statusFilter]);

  // Group events by date
  const grouped = useMemo(() => {
    const groups: { date: string; label: string; events: ActivityEvent[] }[] = [];
    let currentKey = "";

    for (const event of events) {
      const key = getDateKey(event.timestamp);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({ date: key, label: getDateLabel(event.timestamp), events: [] });
      }
      groups[groups.length - 1].events.push(event);
    }

    return groups;
  }, [events]);

  const hasActiveFilters = capFilter !== "all" || statusFilter !== "all";

  return (
    <div className="h-full overflow-y-auto" data-testid="activity-page">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-muted-foreground" />
              Activity
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              What your agent has been up to
            </p>
          </div>
          <button
            data-testid="activity-refresh-button"
            onClick={loadEvents}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Stats */}
        {!loading && allEvents.length > 0 && <StatsBar events={allEvents} />}

        {/* Filter row */}
        <div className="flex items-center gap-2 mb-5">
          <FilterDropdown
            label="Capability"
            value={capFilter}
            options={["all", "channels", "memory", "scheduler", "models", "skills", "providers"]}
            onChange={setCapFilter}
            testIdPrefix="activity-capability"
          />
          <FilterDropdown
            label="Status"
            value={statusFilter}
            options={["all", "success", "failure", "pending"]}
            onChange={setStatusFilter}
            testIdPrefix="activity-status"
          />

          {hasActiveFilters && (
            <button
              onClick={() => {
                setCapFilter("all");
                setStatusFilter("all");
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground ml-1 underline underline-offset-2"
            >
              Clear filters
            </button>
          )}

          {/* Event count */}
          <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
            {!loading && (
              hasActiveFilters
                ? `${events.length} of ${allEvents.length}`
                : `${events.length} events`
            )}
          </span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Activity className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-[13px] text-muted-foreground">
              {hasActiveFilters
                ? "No events match your filters"
                : "No activity yet"}
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => { setCapFilter("all"); setStatusFilter("all"); }}
                className="text-[12px] text-muted-foreground hover:text-foreground mt-2 underline underline-offset-2"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Event feed grouped by date */}
        {!loading && grouped.length > 0 && (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.date}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                    {group.events.length}
                  </span>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {group.events.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
