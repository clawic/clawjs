"use client";

import { useState, useCallback, useEffect } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Activity, RefreshCw, Loader2, Wrench, CheckCircle2,
  AlertTriangle, XCircle, HelpCircle, ShieldCheck, Info,
} from "lucide-react";

interface CapabilityHealth {
  name: string;
  status: "ready" | "degraded" | "error" | "unknown";
  lastChecked: number;
  details?: string;
  actions?: string[];
}

const CAPABILITY_ICONS: Record<string, string> = {
  runtime: "cpu", workspace: "folder", auth: "shield", models: "brain",
  conversations: "messages", scheduler: "clock", memory: "database",
  skills: "layers", channels: "radio", plugins: "puzzle",
  file_sync: "files", orchestration: "workflow",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "ready") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "degraded") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  if (status === "error") return <XCircle className="w-4 h-4 text-red-500" />;
  return <HelpCircle className="w-4 h-4 text-gray-400" />;
}

function statusBadgeClass(status: string) {
  if (status === "ready") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  if (status === "degraded") return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  if (status === "error") return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
  return "bg-gray-500/10 text-gray-500 border-gray-500/20";
}

function overallStatus(caps: CapabilityHealth[]): "healthy" | "degraded" | "error" {
  if (caps.some((c) => c.status === "error")) return "error";
  if (caps.some((c) => c.status === "degraded")) return "degraded";
  return "healthy";
}

export default function HealthPage() {
  const { formatDate } = useLocale();
  const [capabilities, setCapabilities] = useState<CapabilityHealth[]>([]);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setCapabilities(data.capabilities ?? []);
        setCheckedAt(data.checkedAt);
      }
      setLoaded(true);
    } catch { setLoaded(true); }
    setRefreshing(false);
  }, []);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const repair = async (name: string) => {
    setRepairing(name);
    try {
      const res = await fetch("/api/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability: name }),
      });
      if (res.ok) {
        const data = await res.json();
        setCapabilities((prev) =>
          prev.map((c) => (c.name === name ? data.repaired : c))
        );
        setToast({ type: "success", text: `${name} repaired` });
      }
    } catch {
      setToast({ type: "error", text: `Failed to repair ${name}` });
    }
    setRepairing(null);
  };

  const overall = overallStatus(capabilities);
  const readyCount = capabilities.filter((c) => c.status === "ready").length;
  const degradedCount = capabilities.filter((c) => c.status === "degraded").length;
  const errorCount = capabilities.filter((c) => c.status === "error").length;

  return (
    <div className="h-full overflow-y-auto" data-testid="health-page">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-muted-foreground" />
              Workspace Health
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Monitor capability status and run diagnostics</p>
          </div>
          <button
            data-testid="health-run-diagnostics"
            onClick={load}
            disabled={refreshing}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Run Diagnostics
          </button>
        </div>

        {toast && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-[12px] font-medium ${toast.type === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"}`}>
            {toast.text}
          </div>
        )}

        {/* Overall status banner */}
        {loaded && (
          <div className={`mb-5 px-4 py-3 rounded-xl border flex items-center justify-between ${
            overall === "healthy" ? "bg-emerald-500/5 border-emerald-500/20" :
            overall === "degraded" ? "bg-amber-500/5 border-amber-500/20" :
            "bg-red-500/5 border-red-500/20"
          }`}>
            <div className="flex items-center gap-3">
              <ShieldCheck className={`w-5 h-5 ${
                overall === "healthy" ? "text-emerald-500" :
                overall === "degraded" ? "text-amber-500" : "text-red-500"
              }`} />
              <div>
                <span className={`text-[13px] font-semibold ${
                  overall === "healthy" ? "text-emerald-600 dark:text-emerald-400" :
                  overall === "degraded" ? "text-amber-600 dark:text-amber-400" :
                  "text-red-600 dark:text-red-400"
                }`}>
                  {overall === "healthy" ? "All Systems Operational" :
                   overall === "degraded" ? "Degraded Performance" : "System Errors Detected"}
                </span>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{readyCount} ready</span>
                  {degradedCount > 0 && <span className="text-[10px] text-amber-500">{degradedCount} degraded</span>}
                  {errorCount > 0 && <span className="text-[10px] text-red-500">{errorCount} errors</span>}
                </div>
              </div>
            </div>
            {checkedAt && (
              <span className="text-[10px] text-muted-foreground">
                Last check: {formatDate(new Date(checkedAt), { hour: "numeric", minute: "numeric", second: "numeric" })}
              </span>
            )}
          </div>
        )}

        {/* Capability grid */}
        {!loaded ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Loader2 className="w-5 h-5 text-muted-foreground mx-auto animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {capabilities.map((cap) => (
              <div key={cap.name} data-testid="health-capability-card" data-capability-name={cap.name} className="bg-card border border-border rounded-xl p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={cap.status} />
                    <span className="text-[13px] font-medium text-foreground capitalize">
                      {cap.name.replace(/_/g, " ")}
                    </span>
                  </div>
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md border ${statusBadgeClass(cap.status)}`}>
                    {cap.status}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">{cap.details}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground/70">
                    {formatDate(new Date(cap.lastChecked), { hour: "numeric", minute: "numeric" })}
                  </span>
                  {(cap.status === "degraded" || cap.status === "error") && (
                    <button
                      data-testid="health-repair-button"
                      onClick={() => repair(cap.name)}
                      disabled={repairing === cap.name}
                      className="text-[10px] font-medium px-2 py-1 rounded-lg flex items-center gap-1 bg-muted hover:bg-border text-foreground transition-colors"
                    >
                      {repairing === cap.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                      Repair
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Config version info */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-[12px] font-medium text-foreground">Configuration</span>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] text-muted-foreground">Version</span>
              <p className="text-[13px] font-mono text-foreground">v1.0</p>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Last Modified</span>
              <p className="text-[13px] font-mono text-foreground">
                {formatDate(new Date(Date.now() - 86400000 * 3), { year: "numeric", month: "short", day: "numeric" })}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Capabilities</span>
              <p className="text-[13px] font-mono text-foreground">{capabilities.length}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
