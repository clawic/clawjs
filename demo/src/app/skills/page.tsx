"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Search, Package, Download, Loader2, ExternalLink,
  RefreshCw, Trash2, Plus, Layers, Settings2, X, ChevronRight,
} from "lucide-react";

interface SkillDescriptorUI {
  id: string;
  label: string;
  enabled: boolean;
  scope?: "workspace" | "runtime" | "global";
  path?: string;
}

interface SkillCatalogEntryUI {
  source: string;
  slug: string;
  label: string;
  summary?: string;
  installRef: string;
  homepage?: string;
}

interface SkillSourceDescriptorUI {
  id: string;
  label: string;
  status: "ready" | "degraded" | "unsupported";
  capabilities: { search: boolean; install: boolean; resolveExact: boolean };
  summary?: string;
  warnings?: string[];
}

function SkillEntryRow({ entry, installed, installing, onInstall, m }: {
  entry: SkillCatalogEntryUI;
  installed: boolean;
  installing: string | null;
  onInstall: (ref: string, source?: string) => void;
  m: { install: string; installing: string; installed: string };
}) {
  return (
    <div data-testid="skill-search-result" data-skill-slug={entry.slug} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center flex-shrink-0 border border-border/50">
        <Package className="w-4 h-4 text-foreground/60" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground truncate">{entry.label}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex-shrink-0 font-mono">{entry.source}</span>
        </div>
        {entry.summary && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{entry.summary}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {entry.homepage && (
          <a href={entry.homepage} target="_blank" rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {installed ? (
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 px-2.5 py-1">
            {m.installed}
          </span>
        ) : (
          <button
            data-testid="skill-install-button"
            onClick={() => onInstall(entry.installRef, entry.source)}
            disabled={installing === entry.installRef}
            className="text-[11px] font-medium text-foreground bg-muted hover:bg-border disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {installing === entry.installRef ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            {m.install}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const { messages } = useLocale();
  const m = messages.settings.tools.skills;

  const [installedSkills, setInstalledSkills] = useState<SkillDescriptorUI[]>([]);
  const [skillSources, setSkillSources] = useState<SkillSourceDescriptorUI[]>([]);
  const [enabledSources, setEnabledSources] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SkillCatalogEntryUI[]>([]);
  const [activeSourceTab, setActiveSourceTab] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [pendingSearch, setPendingSearch] = useState(false); // debounce indicator
  const [installing, setInstalling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [installRef, setInstallRef] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showSourcesPopover, setShowSourcesPopover] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showRefInput, setShowRefInput] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourcesPopoverRef = useRef<HTMLDivElement>(null);

  const PREVIEW_LIMIT = 5;

  // Close sources popover on outside click
  useEffect(() => {
    if (!showSourcesPopover) return;
    const handler = (e: MouseEvent) => {
      if (sourcesPopoverRef.current && !sourcesPopoverRef.current.contains(e.target as Node)) {
        setShowSourcesPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSourcesPopover]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadSkills = useCallback(async () => {
    try {
      const [listRes, sourcesRes] = await Promise.all([
        fetch("/api/skills/list"),
        fetch("/api/skills/sources"),
      ]);
      if (listRes.ok) {
        const data = await listRes.json() as { skills: SkillDescriptorUI[] };
        setInstalledSkills(data.skills ?? []);
      }
      if (sourcesRes.ok) {
        const data = await sourcesRes.json() as { sources: SkillSourceDescriptorUI[] };
        setSkillSources(data.sources ?? []);
        setEnabledSources((prev) => {
          if (prev.size > 0) return prev;
          return new Set(data.sources.map((s: SkillSourceDescriptorUI) => s.id));
        });
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  const doSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/skills/search?q=${encodeURIComponent(query)}&limit=30`);
      if (res.ok) {
        const data = await res.json() as { entries: SkillCatalogEntryUI[] };
        setSearchResults(data.entries ?? []);
        setActiveSourceTab(null);
      }
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, []);

  const installSkill = useCallback(async (ref: string, source?: string) => {
    setInstalling(ref);
    setToast(null);
    try {
      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, source }),
      });
      if (res.ok) {
        setToast({ type: "success", text: m.installSuccess });
        setInstallRef("");
        setShowRefInput(false);
        await loadSkills();
      } else {
        const data = await res.json() as { error?: string };
        setToast({ type: "error", text: data.error || m.installError });
      }
    } catch {
      setToast({ type: "error", text: m.installError });
    }
    setInstalling(null);
  }, [loadSkills, m]);

  const removeSkill = useCallback(async (id: string) => {
    setRemoving(id);
    setToast(null);
    try {
      const res = await fetch("/api/skills/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setToast({ type: "success", text: "Skill removed." });
        await loadSkills();
      } else {
        const data = await res.json() as { error?: string };
        setToast({ type: "error", text: data.error || "Failed to remove skill." });
      }
    } catch {
      setToast({ type: "error", text: "Failed to remove skill." });
    }
    setRemoving(null);
  }, [loadSkills]);

  const toggleSource = (id: string) => {
    setEnabledSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!loaded) loadSkills();
  }, [loaded, loadSkills]);

  const isInstalled = (slug: string, label: string) =>
    installedSkills.some((s) => s.id === slug || s.label === label);

  const fallbackLocalResults = useMemo<SkillCatalogEntryUI[]>(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (normalized.length < 2 || searchResults.length > 0) return [];
    return installedSkills
      .filter((skill) =>
        skill.label.toLowerCase().includes(normalized)
        || skill.id.toLowerCase().includes(normalized),
      )
      .map((skill) => ({
        source: skill.scope ?? "workspace",
        slug: skill.id,
        label: skill.label,
        summary: skill.id,
        installRef: `${skill.scope ?? "workspace"}:${skill.id}`,
      }));
  }, [installedSkills, searchQuery, searchResults]);

  const effectiveSearchResults = searchResults.length > 0 ? searchResults : fallbackLocalResults;

  // Filter results by enabled sources
  const filteredResults = enabledSources.size === 0
    ? effectiveSearchResults
    : effectiveSearchResults.filter((r) => enabledSources.has(r.source));

  // Group results by source
  const resultSources = [...new Set(filteredResults.map((r) => r.source))];
  const allVisibleResults = activeSourceTab
    ? filteredResults.filter((r) => r.source === activeSourceTab)
    : filteredResults;
  const previewResults = allVisibleResults.slice(0, PREVIEW_LIMIT);
  const hasMore = allVisibleResults.length > PREVIEW_LIMIT;

  // Close modal on Escape
  useEffect(() => {
    if (!showAllResults) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAllResults(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showAllResults]);

  return (
    <div className="h-full overflow-y-auto" data-testid="skills-page">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-5 h-5 text-muted-foreground" />
              Skills
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{m.description}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowRefInput(!showRefInput)}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {m.installFromRef}
            </button>
            {/* Sources popover trigger */}
            <div className="relative" ref={sourcesPopoverRef}>
              <button
                onClick={() => setShowSourcesPopover(!showSourcesPopover)}
                className={`p-1.5 rounded-lg transition-colors ${showSourcesPopover ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                title={m.sources}
              >
                <Settings2 className="w-4 h-4" />
              </button>
              {showSourcesPopover && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <span className="text-[12px] font-medium text-foreground">{m.sources}</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Toggle sources used when searching</p>
                  </div>
                  {skillSources.map((source) => {
                    const enabled = enabledSources.has(source.id);
                    const degraded = source.status === "degraded";
                    return (
                      <div key={source.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-foreground">{source.label}</span>
                            {degraded && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                {m.sourceDegraded ?? "limited"}
                              </span>
                            )}
                          </div>
                          {source.summary && (
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{source.summary}</p>
                          )}
                        </div>
                        <button
                          onClick={() => toggleSource(source.id)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                            enabled ? "bg-emerald-500" : "bg-border-hover"
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out mt-0.5 ${
                            enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                          }`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              onClick={loadSkills}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Toast ── */}
        {toast && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all ${
            toast.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
          }`}>
            {toast.text}
          </div>
        )}

        {/* ── Install from reference (collapsible) ── */}
        {showRefInput && (
          <div className="mb-4 bg-card border border-border rounded-xl p-4">
            <div className="text-[12px] font-medium text-foreground mb-2">{m.installFromRef}</div>
            <div className="flex gap-2">
              <input
                data-testid="skills-install-ref-input"
                type="text"
                value={installRef}
                onChange={(e) => setInstallRef(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && installRef.trim()) installSkill(installRef.trim());
                  if (e.key === "Escape") setShowRefInput(false);
                }}
                autoFocus
                placeholder={m.refPlaceholder}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
              />
              <button
                data-testid="skills-install-ref-button"
                onClick={() => { if (installRef.trim()) installSkill(installRef.trim()); }}
                disabled={!installRef.trim() || !!installing}
                className="px-4 py-2 bg-foreground text-primary-foreground text-[12px] font-medium rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                {m.install}
              </button>
            </div>
          </div>
        )}

        {/* ── Search ── */}
        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            data-testid="skills-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const q = e.target.value;
              setSearchQuery(q);
              if (searchTimeout.current) clearTimeout(searchTimeout.current);
              if (q.trim().length >= 2) {
                setPendingSearch(true);
                searchTimeout.current = setTimeout(() => { setPendingSearch(false); doSearch(q); }, 400);
              } else {
                setPendingSearch(false);
                setSearchResults([]);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim().length >= 2) {
                if (searchTimeout.current) clearTimeout(searchTimeout.current);
                doSearch(searchQuery);
              }
            }}
            placeholder={m.searchPlaceholder}
            className="w-full bg-card border border-border rounded-xl pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 transition-all"
          />
          {(searching || pendingSearch) && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
          {!searching && !pendingSearch && searchQuery.length > 0 && (
            <button
              onClick={() => { setSearchQuery(""); setSearchResults([]); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* ── Search skeleton ── */}
        {(searching || pendingSearch) && searchQuery.trim().length >= 2 && (
          <div className="mb-5">
            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-9 h-9 rounded-xl bg-muted flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-muted rounded-md w-1/3" />
                    <div className="h-2.5 bg-muted rounded-md w-2/3" />
                  </div>
                  <div className="h-7 w-16 bg-muted rounded-lg flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Search results ── */}
        {searchQuery.trim().length >= 2 && !searching && !pendingSearch && filteredResults.length === 0 && (
          <div className="text-center py-8 mb-5">
            <Search className="w-8 h-8 text-border-hover mx-auto mb-2" />
            <p className="text-[13px] text-muted-foreground">{m.noResults}</p>
          </div>
        )}

        {!searching && !pendingSearch && filteredResults.length > 0 && (
          <div className="mb-5">
            {/* Source tabs */}
            {resultSources.length > 1 && (
              <div className="flex items-center gap-1 mb-3 px-1">
                <button
                  onClick={() => setActiveSourceTab(null)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                    activeSourceTab === null
                      ? "bg-foreground text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  All ({filteredResults.length})
                </button>
                {resultSources.map((src) => {
                  const count = filteredResults.filter((r) => r.source === src).length;
                  const sourceLabel = skillSources.find((s) => s.id === src)?.label ?? src;
                  return (
                    <button
                      key={src}
                      onClick={() => setActiveSourceTab(src)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                        activeSourceTab === src
                          ? "bg-foreground text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {sourceLabel} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Preview results (max 5) */}
            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
              {previewResults.map((entry) => (
                <SkillEntryRow key={`${entry.source}-${entry.slug}`} entry={entry} installed={isInstalled(entry.slug, entry.label)} installing={installing} onInstall={installSkill} m={m} />
              ))}
            </div>

            {/* Show more button */}
            {hasMore && (
              <button
                onClick={() => setShowAllResults(true)}
                className="w-full mt-2 px-4 py-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                Show all {allVisibleResults.length} results
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* ── Full results modal ── */}
        {showAllResults && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAllResults(false)}>
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4" onClick={(e) => e.stopPropagation()}>
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                <div>
                  <h2 className="text-[15px] font-semibold text-foreground">
                    {allVisibleResults.length} results for &ldquo;{searchQuery}&rdquo;
                  </h2>
                  {resultSources.length > 1 && (
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        onClick={() => setActiveSourceTab(null)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                          activeSourceTab === null
                            ? "bg-foreground text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        All ({filteredResults.length})
                      </button>
                      {resultSources.map((src) => {
                        const count = filteredResults.filter((r) => r.source === src).length;
                        const sourceLabel = skillSources.find((s) => s.id === src)?.label ?? src;
                        return (
                          <button
                            key={src}
                            onClick={() => setActiveSourceTab(src)}
                            className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                              activeSourceTab === src
                                ? "bg-foreground text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          >
                            {sourceLabel} ({count})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowAllResults(false)}
                  className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Modal body */}
              <div className="overflow-y-auto flex-1 divide-y divide-border">
                {allVisibleResults.map((entry) => (
                  <SkillEntryRow key={`modal-${entry.source}-${entry.slug}`} entry={entry} installed={isInstalled(entry.slug, entry.label)} installing={installing} onInstall={installSkill} m={m} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Installed skills ── */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
            <span>{m.installedSkills} ({installedSkills.length})</span>
          </div>

          {!loaded ? (
            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-9 h-9 rounded-xl bg-muted flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-muted rounded-md w-2/5" />
                    <div className="h-2.5 bg-muted rounded-md w-1/4" />
                  </div>
                  <div className="h-5 w-14 bg-muted rounded-md flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : installedSkills.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-[13px] text-muted-foreground mb-1">{m.noInstalledSkills}</p>
              <p className="text-[11px] text-muted-foreground/60">{m.searchHint}</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
              {installedSkills.map((skill) => (
                <div key={skill.id} data-testid="installed-skill-item" data-skill-id={skill.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-muted/30 transition-colors">
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 flex items-center justify-center border border-emerald-500/20">
                      <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${skill.enabled ? "bg-emerald-400" : "bg-border-hover"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground truncate">{skill.label}</span>
                      {skill.scope && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">{skill.scope}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">{skill.id}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                      skill.enabled
                        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                        : "text-muted-foreground bg-muted"
                    }`}>
                      {skill.enabled ? m.enabled : m.disabled}
                    </span>
                    <button
                      data-testid="installed-skill-remove-button"
                      onClick={() => removeSkill(skill.id)}
                      disabled={removing === skill.id}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                      title="Remove skill"
                    >
                      {removing === skill.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
