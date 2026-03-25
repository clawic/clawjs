"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Brain, Search, Plus, Trash2, Loader2, ChevronDown, ChevronRight,
  BookOpen, MessageSquare, FileText, Database, HardDrive, X, Tag,
} from "lucide-react";

interface MemoryEntry {
  id: string;
  kind: "file" | "store" | "index" | "session" | "knowledge";
  title: string;
  content: string;
  source: string;
  sessionId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

type KindFilter = "all" | MemoryEntry["kind"];

const KIND_META: Record<MemoryEntry["kind"], { label: string; icon: React.ReactNode; color: string }> = {
  knowledge: { label: "Knowledge", icon: <BookOpen className="w-4 h-4" />, color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  session: { label: "Session", icon: <MessageSquare className="w-4 h-4" />, color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  file: { label: "File", icon: <FileText className="w-4 h-4" />, color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  index: { label: "Index", icon: <Database className="w-4 h-4" />, color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  store: { label: "Store", icon: <HardDrive className="w-4 h-4" />, color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
};

const TABS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "knowledge", label: "Knowledge" },
  { key: "session", label: "Sessions" },
  { key: "file", label: "Files" },
  { key: "index", label: "Indexes" },
  { key: "store", label: "Store" },
];

export default function MemoryPage() {
  const { formatDate } = useLocale();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntry, setNewEntry] = useState({ kind: "knowledge" as MemoryEntry["kind"], title: "", content: "", source: "", tags: "" });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (kindFilter !== "all") params.set("kind", kindFilter);
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/memory?${params}`);
    const data = await res.json();
    setEntries(data.entries);
    setLoaded(true);
  }, [kindFilter, query]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleAdd = async () => {
    if (!newEntry.title.trim()) return;
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newEntry,
        tags: newEntry.tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    });
    const entry = await res.json();
    setEntries((prev) => [entry, ...prev]);
    setNewEntry({ kind: "knowledge", title: "", content: "", source: "", tags: "" });
    setShowAddForm(false);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Stats
  const allEntries = entries;
  const kindCounts: Record<string, number> = {};
  allEntries.forEach((e) => { kindCounts[e.kind] = (kindCounts[e.kind] || 0) + 1; });

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto" data-testid="memory-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="w-6 h-6" /> Memory &amp; Knowledge
        </h1>
        <button data-testid="memory-add-button" onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAddForm ? "Cancel" : "Add Memory"}
        </button>
      </div>

      {/* ── Stats Bar ── */}
      <div className="flex flex-wrap gap-3">
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total:</span>{" "}
          <span className="font-semibold text-foreground">{allEntries.length}</span>
        </div>
        {Object.entries(kindCounts).map(([kind, count]) => {
          const meta = KIND_META[kind as MemoryEntry["kind"]];
          return (
            <div key={kind} className="bg-card border border-border rounded-lg px-4 py-2 text-sm flex items-center gap-2">
              <span className={`flex items-center gap-1 ${meta?.color || ""}`}>
                {meta?.icon} {meta?.label}
              </span>
              <span className="font-semibold text-foreground">{count}</span>
            </div>
          );
        })}
      </div>

      {/* ── Add Form ── */}
      {showAddForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex gap-3">
            <select data-testid="memory-kind-select" value={newEntry.kind} onChange={(e) => setNewEntry({ ...newEntry, kind: e.target.value as MemoryEntry["kind"] })}
              className="px-2 py-1.5 rounded-md bg-muted border border-border text-foreground text-sm">
              {Object.entries(KIND_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <input data-testid="memory-title-input" placeholder="Title" value={newEntry.title} onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
              className="flex-1 px-3 py-1.5 rounded-md bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground" />
          </div>
          <textarea data-testid="memory-content-input" placeholder="Content..." value={newEntry.content} onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
            rows={3} className="w-full px-3 py-2 rounded-md bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground resize-none" />
          <div className="flex gap-3">
            <input data-testid="memory-source-input" placeholder="Source" value={newEntry.source} onChange={(e) => setNewEntry({ ...newEntry, source: e.target.value })}
              className="flex-1 px-3 py-1.5 rounded-md bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground" />
            <input data-testid="memory-tags-input" placeholder="Tags (comma-separated)" value={newEntry.tags} onChange={(e) => setNewEntry({ ...newEntry, tags: e.target.value })}
              className="flex-1 px-3 py-1.5 rounded-md bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground" />
          </div>
          <button data-testid="memory-save-button" onClick={handleAdd}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="w-3.5 h-3.5" /> Save Entry
          </button>
        </div>
      )}

      {/* ── Filter Tabs & Search ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {TABS.map((tab) => (
            <button key={tab.key} data-testid={`memory-filter-${tab.key}`} onClick={() => setKindFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                kindFilter === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input data-testid="memory-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground" />
        </div>
      </div>

      {/* ── Memory Cards ── */}
      {entries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No memory entries found.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const meta = KIND_META[entry.kind];
            const isExpanded = expandedId === entry.id;
            return (
              <div key={entry.id} data-testid="memory-entry" data-entry-id={entry.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <button data-testid="memory-entry-toggle" onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors">
                  <span className={`mt-0.5 flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{entry.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${meta.color}`}>{meta.label}</span>
                    </div>
                    {!isExpanded && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{entry.content}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>{entry.source}</span>
                      <span>{formatDate(new Date(entry.updatedAt), { month: "short", day: "numeric" })}</span>
                    </div>
                  </div>
                  <span className="mt-1 text-muted-foreground shrink-0">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-border">
                    <p className="text-sm text-foreground whitespace-pre-wrap mt-3 leading-relaxed">{entry.content}</p>
                    {entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {entry.tags.map((tag) => (
                          <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            <Tag className="w-2.5 h-2.5" /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <div className="text-xs text-muted-foreground space-x-4">
                        <span>Created: {formatDate(new Date(entry.createdAt), { month: "short", day: "numeric", year: "numeric" })}</span>
                        <span>Updated: {formatDate(new Date(entry.updatedAt), { month: "short", day: "numeric", year: "numeric" })}</span>
                        {entry.sessionId && <span>Session: {entry.sessionId}</span>}
                      </div>
                      <button data-testid="memory-delete-button" onClick={() => handleDelete(entry.id)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
