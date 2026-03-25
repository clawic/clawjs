"use client";

import { useState, useCallback, useEffect } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Puzzle, Plus, Trash2, RefreshCw, Loader2, Power, PowerOff,
  ChevronDown, ChevronRight, ScrollText, AlertCircle,
} from "lucide-react";

interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  status: "active" | "inactive" | "error";
  config: Record<string, unknown>;
  installedAt: number;
  lastActivity?: number;
}

const FAKE_LOGS: Record<string, string[]> = {
  "web-search": [
    "[INFO] Query processed: 'Next.js 16 release notes' (320ms)",
    "[INFO] Cache hit ratio: 78%",
    "[WARN] Rate limit approaching: 82/100 requests",
    "[INFO] Provider fallback: google -> bing (timeout)",
    "[INFO] Results returned: 8 items",
  ],
  "calendar-sync": [
    "[INFO] Sync completed: 12 events updated",
    "[INFO] New event detected: Sprint Planning",
    "[WARN] Duplicate event skipped: 1:1 Weekly",
    "[INFO] Notification sent: Meeting in 15min",
    "[INFO] Full sync triggered by user",
  ],
  "code-runner": [
    "[INFO] Container pool: 0/5 active",
    "[WARN] Plugin deactivated by user",
    "[INFO] Last execution: Python snippet (2.1s)",
    "[ERROR] Container timeout after 30s",
    "[INFO] Sandbox cleanup completed",
  ],
};

function getLogsForPlugin(name: string): string[] {
  return FAKE_LOGS[name] || [
    "[INFO] Plugin initialized",
    "[INFO] Health check passed",
    "[INFO] No recent activity",
  ];
}

export default function PluginsPage() {
  const { formatDate } = useLocale();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [configEdits, setConfigEdits] = useState<Record<string, string>>({});
  const [installName, setInstallName] = useState("");
  const [installing, setInstalling] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/plugins");
      if (res.ok) {
        const data = await res.json();
        setPlugins(data.plugins ?? []);
      }
      setLoaded(true);
    } catch { setLoaded(true); }
  }, []);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => prev === id ? null : id);
  };

  const toggleStatus = async (plugin: Plugin) => {
    const newStatus = plugin.status === "active" ? "inactive" : "active";
    const res = await fetch("/api/plugins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plugin.id, status: newStatus }),
    });
    if (res.ok) { await load(); setToast({ type: "success", text: `Plugin ${newStatus}` }); }
  };

  const saveConfig = async (plugin: Plugin) => {
    const raw = configEdits[plugin.id];
    if (!raw) return;
    try {
      const config = JSON.parse(raw);
      const res = await fetch("/api/plugins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plugin.id, config }),
      });
      if (res.ok) { await load(); setToast({ type: "success", text: "Config saved" }); }
    } catch { setToast({ type: "error", text: "Invalid JSON" }); }
  };

  const uninstall = async (id: string) => {
    const res = await fetch(`/api/plugins?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setExpandedId(null);
      await load();
      setToast({ type: "success", text: "Plugin uninstalled" });
    }
  };

  const installPlugin = async () => {
    if (!installName.trim()) return;
    setInstalling(true);
    const res = await fetch("/api/plugins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: installName.trim() }),
    });
    if (res.ok) {
      setInstallName("");
      await load();
      setToast({ type: "success", text: "Plugin installed" });
    }
    setInstalling(false);
  };

  const statusColor = (s: string) =>
    s === "active" ? "bg-emerald-400" : s === "error" ? "bg-red-400" : "bg-gray-400";
  const statusLabel = (s: string) =>
    s === "active" ? "Active" : s === "error" ? "Error" : "Inactive";

  return (
    <div className="h-full overflow-y-auto" data-testid="plugins-page">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Puzzle className="w-5 h-5 text-muted-foreground" />
              Plugins
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Manage installed plugins and their configurations</p>
          </div>
          <button onClick={load} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {toast && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-[12px] font-medium ${toast.type === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"}`}>
            {toast.text}
          </div>
        )}

        {/* Install section */}
        <div className="mb-5 bg-card border border-border rounded-xl p-4">
          <div className="text-[12px] font-medium text-foreground mb-2 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Install Plugin
          </div>
          <div className="flex gap-2">
            <input
              data-testid="plugins-install-input"
              type="text"
              value={installName}
              onChange={(e) => setInstallName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") installPlugin(); }}
              placeholder="Plugin name or reference..."
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
            />
            <button
              data-testid="plugins-install-button"
              onClick={installPlugin}
              disabled={!installName.trim() || installing}
              className="px-4 py-2 bg-foreground text-primary-foreground text-[12px] font-medium rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Install
            </button>
          </div>
        </div>

        {/* Plugin list */}
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
          Installed ({plugins.length})
        </div>

        {!loaded ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Loader2 className="w-5 h-5 text-muted-foreground mx-auto animate-spin" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Puzzle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-[13px] text-muted-foreground">No plugins installed</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {plugins.map((plugin) => {
              const expanded = expandedId === plugin.id;
              const logs = getLogsForPlugin(plugin.name);
              return (
                <div key={plugin.id} data-testid="plugin-item" data-plugin-id={plugin.id}>
                  <div
                    data-testid="plugin-expand-button"
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(plugin.id)}
                  >
                    {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">{plugin.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">v{plugin.version}</span>
                        <span className={`w-2 h-2 rounded-full ${statusColor(plugin.status)}`} />
                        <span className="text-[10px] text-muted-foreground">{statusLabel(plugin.status)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{plugin.description}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {plugin.lastActivity ? formatDate(new Date(plugin.lastActivity), { hour: "numeric", minute: "numeric" }) : "No activity"}
                    </span>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/20">
                      {/* Controls */}
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          data-testid="plugin-toggle-button"
                          onClick={(e) => { e.stopPropagation(); toggleStatus(plugin); }}
                          className={`text-[11px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${plugin.status === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" : "bg-muted text-muted-foreground hover:bg-border"}`}
                        >
                          {plugin.status === "active" ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                          {plugin.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          data-testid="plugin-uninstall-button"
                          onClick={(e) => { e.stopPropagation(); uninstall(plugin.id); }}
                          className="text-[11px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Uninstall
                        </button>
                      </div>

                      {/* Config editor */}
                      <div className="mb-3">
                        <div className="text-[11px] font-medium text-muted-foreground mb-1">Configuration</div>
                        <textarea
                          data-testid="plugin-config-input"
                          value={configEdits[plugin.id] ?? JSON.stringify(plugin.config, null, 2)}
                          onChange={(e) => setConfigEdits({ ...configEdits, [plugin.id]: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          rows={5}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground resize-none"
                        />
                        <button
                          data-testid="plugin-save-config-button"
                          onClick={(e) => { e.stopPropagation(); saveConfig(plugin); }}
                          className="mt-1 text-[11px] font-medium px-3 py-1 rounded-lg bg-foreground text-primary-foreground hover:bg-foreground-intense transition-colors"
                        >
                          Save Config
                        </button>
                      </div>

                      {/* Logs */}
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                          <ScrollText className="w-3 h-3" /> Recent Logs
                        </div>
                        <div className="bg-background border border-border rounded-lg p-2 space-y-0.5">
                          {logs.map((log, i) => (
                            <div key={i} className={`text-[10px] font-mono ${log.includes("[ERROR]") ? "text-red-500" : log.includes("[WARN]") ? "text-amber-500" : "text-muted-foreground"}`}>
                              {log}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Error plugins notice */}
        {plugins.some((p) => p.status === "error") && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[12px] font-medium text-red-600 dark:text-red-400">Plugin errors detected</p>
              <p className="text-[11px] text-red-500/80">Some plugins have encountered errors. Expand them to view logs and repair.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
