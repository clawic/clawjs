"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Users, Search, Plus, Loader2, X, Trash2, Mail, Phone, Building2,
  Tag, TrendingUp, TrendingDown, Minus, MessageSquare, Clock, Edit3,
  LayoutGrid, List, ChevronDown, Star, Filter, StickyNote, Monitor,
  MessageCircle, Send,
} from "lucide-react";

/* ── Types ── */

interface StoredContact {
  id: string; label: string; messages_sent: number; messages_received: number;
  tone_score: number; tone_trend: number; topics: string[];
  response_latency_avg_seconds: number; baseline_deviation: number;
  tier?: number; role?: string; email?: string; phone?: string;
  company?: string; notes?: string; avatarEmoji?: string;
  createdAt: number; updatedAt: number;
}

interface NativeContact {
  id: string; firstName: string; lastName: string; company: string;
  emails: string[]; phones: string[]; note: string;
}

type ContactSource = "all" | "manual" | "mac" | "whatsapp" | "email" | "telegram";
type ViewMode = "grid" | "list";
type SortField = "label" | "tone_score" | "messages" | "recent";
type TierFilter = "all" | 1 | 2 | 3 | 4;

interface UnifiedContact {
  id: string; source: ContactSource; label: string;
  email?: string; phone?: string; company?: string; role?: string;
  notes?: string; avatarEmoji?: string; tier?: number;
  tone_score: number; tone_trend: number;
  messages_sent: number; messages_received: number;
  response_latency_avg_seconds: number; baseline_deviation: number;
  topics: string[]; createdAt: number; updatedAt: number;
  _stored?: StoredContact; _native?: NativeContact;
}

/* ── Helpers ── */

const TIER_LABELS: Record<number, string> = { 1: "Priority", 2: "Key", 3: "Contact", 4: "Noise" };
const TIER_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/30" },
  2: { bg: "bg-blue-500/15", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500/30" },
  3: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30" },
  4: { bg: "bg-zinc-500/15", text: "text-zinc-600 dark:text-zinc-400", border: "border-zinc-500/30" },
};
const SOURCE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  all: { label: "All", icon: <Users className="w-3.5 h-3.5" />, color: "text-foreground" },
  manual: { label: "Manual", icon: <Plus className="w-3.5 h-3.5" />, color: "text-foreground" },
  mac: { label: "Mac Contacts", icon: <Monitor className="w-3.5 h-3.5" />, color: "text-zinc-600 dark:text-zinc-400" },
  whatsapp: { label: "WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5" />, color: "text-green-600 dark:text-green-400" },
  email: { label: "Email", icon: <Mail className="w-3.5 h-3.5" />, color: "text-violet-600 dark:text-violet-400" },
  telegram: { label: "Telegram", icon: <Send className="w-3.5 h-3.5" />, color: "text-blue-600 dark:text-blue-400" },
};
const AVATAR_COLORS = ["bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-cyan-500","bg-orange-500","bg-pink-500","bg-teal-500","bg-indigo-500"];

function avatarColor(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h); return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]; }
function initials(label: string) { const p = label.trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : label.slice(0, 2).toUpperCase(); }
function toneLabel(score: number) { if (score >= 0.8) return { label: "Excellent", color: "text-emerald-600 dark:text-emerald-400" }; if (score >= 0.6) return { label: "Good", color: "text-blue-600 dark:text-blue-400" }; if (score >= 0.4) return { label: "Neutral", color: "text-zinc-500" }; if (score >= 0.2) return { label: "Low", color: "text-amber-600 dark:text-amber-400" }; return { label: "Poor", color: "text-red-600 dark:text-red-400" }; }
function formatLatency(s: number) { if (s < 60) return `${Math.round(s)}s`; if (s < 3600) return `${Math.round(s / 60)}m`; if (s < 86400) return `${Math.round(s / 3600)}h`; return `${Math.round(s / 86400)}d`; }

function nativeToUnified(nc: NativeContact): UnifiedContact {
  const label = [nc.firstName, nc.lastName].filter(Boolean).join(" ") || nc.company || "Unnamed";
  return { id: `mac:${nc.id}`, source: "mac", label, email: nc.emails[0], phone: nc.phones[0], company: nc.company, notes: nc.note, tier: 3, tone_score: 0.5, tone_trend: 0, messages_sent: 0, messages_received: 0, response_latency_avg_seconds: 0, baseline_deviation: 0, topics: [], createdAt: 0, updatedAt: 0, _native: nc };
}

function storedToUnified(sc: StoredContact): UnifiedContact {
  return { id: `manual:${sc.id}`, source: "manual", label: sc.label, email: sc.email, phone: sc.phone, company: sc.company, role: sc.role, notes: sc.notes, avatarEmoji: sc.avatarEmoji, tier: sc.tier, tone_score: sc.tone_score, tone_trend: sc.tone_trend, messages_sent: sc.messages_sent, messages_received: sc.messages_received, response_latency_avg_seconds: sc.response_latency_avg_seconds, baseline_deviation: sc.baseline_deviation, topics: sc.topics, createdAt: sc.createdAt, updatedAt: sc.updatedAt, _stored: sc };
}

/* ── Main ── */

export default function ContactsPage() {
  const { messages } = useLocale();
  const [storedContacts, setStoredContacts] = useState<StoredContact[]>([]);
  const [nativeContacts, setNativeContacts] = useState<NativeContact[]>([]);
  const [nativeEnabled, setNativeEnabled] = useState(false);
  const [nativeLoading, setNativeLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<ContactSource>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortField, setSortField] = useState<SortField>("label");
  const [selectedContact, setSelectedContact] = useState<UnifiedContact | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingContact, setEditingContact] = useState<StoredContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formTier, setFormTier] = useState(3);
  const [formTopics, setFormTopics] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formEmoji, setFormEmoji] = useState("");

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const loadStoredContacts = useCallback(async () => { try { const r = await fetch("/api/contacts"); if (r.ok) { const d = await r.json(); setStoredContacts(d.contacts ?? []); } } catch {} }, []);
  const loadNativeContacts = useCallback(async () => { setNativeLoading(true); try { const r = await fetch("/api/contacts/native?limit=1000"); if (r.ok) { const d = await r.json(); const list = d.contacts ?? []; setNativeContacts(list); if (list.length > 0) setNativeEnabled(true); } } catch {} setNativeLoading(false); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Load stored contacts (fast) → mark page as loaded
      await loadStoredContacts();
      if (!cancelled) setLoaded(true);

      // 2. Check config to see if native contacts are enabled
      try {
        const r = await fetch("/api/config");
        if (r.ok && !cancelled) {
          const cfg = await r.json();
          if (cfg.contactsEnabled) {
            // Directly load native contacts - no need for the heavy integrations/status call
            loadNativeContacts();
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [loadStoredContacts, loadNativeContacts]);

  const allContacts = useMemo<UnifiedContact[]>(() => {
    const u: UnifiedContact[] = [...storedContacts.map(storedToUnified)];
    if (nativeEnabled) u.push(...nativeContacts.map(nativeToUnified));
    return u;
  }, [storedContacts, nativeContacts, nativeEnabled]);

  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = { all: allContacts.length, manual: 0, mac: 0, whatsapp: 0, email: 0, telegram: 0 };
    for (const ct of allContacts) c[ct.source] = (c[ct.source] || 0) + 1;
    return c;
  }, [allContacts]);

  const activeSources = useMemo(() => (["all","manual","mac","whatsapp","email","telegram"] as ContactSource[]).filter(s => s === "all" || sourceCounts[s] > 0), [sourceCounts]);

  const createContact = async () => {
    if (!formLabel.trim() || creating) return;
    setCreating(true);
    try {
      const r = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: formLabel.trim(), email: formEmail.trim() || undefined, phone: formPhone.trim() || undefined, company: formCompany.trim() || undefined, role: formRole.trim() || undefined, tier: formTier, topics: formTopics.split(",").map(t => t.trim()).filter(Boolean), notes: formNotes.trim() || undefined, avatarEmoji: formEmoji.trim() || undefined }) });
      if (r.ok) { const c = await r.json(); setStoredContacts(p => [...p, c]); resetForm(); setToast({ type: "success", text: "Contact created" }); }
    } catch { setToast({ type: "error", text: "Failed to create contact" }); }
    setCreating(false);
  };

  const updateContact = async () => {
    if (!editingContact || !formLabel.trim() || creating) return;
    setCreating(true);
    try {
      const r = await fetch("/api/contacts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingContact.id, label: formLabel.trim(), email: formEmail.trim() || undefined, phone: formPhone.trim() || undefined, company: formCompany.trim() || undefined, role: formRole.trim() || undefined, tier: formTier, topics: formTopics.split(",").map(t => t.trim()).filter(Boolean), notes: formNotes.trim() || undefined, avatarEmoji: formEmoji.trim() || undefined }) });
      if (r.ok) { const u = await r.json(); setStoredContacts(p => p.map(c => c.id === u.id ? u : c)); resetForm(); setToast({ type: "success", text: "Contact updated" }); }
    } catch { setToast({ type: "error", text: "Failed to update contact" }); }
    setCreating(false);
  };

  const deleteContact = async (id: string) => {
    const realId = id.replace("manual:", "");
    try { const r = await fetch(`/api/contacts?id=${realId}`, { method: "DELETE" }); if (r.ok) { setStoredContacts(p => p.filter(c => c.id !== realId)); if (selectedContact?.id === id) setSelectedContact(null); setToast({ type: "success", text: "Contact deleted" }); } }
    catch { setToast({ type: "error", text: "Failed to delete contact" }); }
  };

  const resetForm = () => { setShowCreateForm(false); setEditingContact(null); setFormLabel(""); setFormEmail(""); setFormPhone(""); setFormCompany(""); setFormRole(""); setFormTier(3); setFormTopics(""); setFormNotes(""); setFormEmoji(""); };

  const openEditForm = (contact: UnifiedContact) => {
    if (contact.source !== "manual" || !contact._stored) return;
    const sc = contact._stored;
    setEditingContact(sc); setFormLabel(sc.label); setFormEmail(sc.email ?? ""); setFormPhone(sc.phone ?? ""); setFormCompany(sc.company ?? ""); setFormRole(sc.role ?? ""); setFormTier(sc.tier ?? 3); setFormTopics(sc.topics.join(", ")); setFormNotes(sc.notes ?? ""); setFormEmoji(sc.avatarEmoji ?? ""); setShowCreateForm(true);
  };

  const filtered = useMemo(() => {
    let list = allContacts;
    if (sourceFilter !== "all") list = list.filter(c => c.source === sourceFilter);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(c => c.label.toLowerCase().includes(q) || c.role?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q) || c.topics.some(t => t.toLowerCase().includes(q))); }
    if (tierFilter !== "all") list = list.filter(c => (c.tier ?? 3) === tierFilter);
    const sorted = [...list];
    switch (sortField) {
      case "label": sorted.sort((a, b) => a.label.localeCompare(b.label)); break;
      case "tone_score": sorted.sort((a, b) => b.tone_score - a.tone_score); break;
      case "messages": sorted.sort((a, b) => (b.messages_sent + b.messages_received) - (a.messages_sent + a.messages_received)); break;
      case "recent": sorted.sort((a, b) => b.updatedAt - a.updatedAt); break;
    }
    return sorted;
  }, [allContacts, search, sourceFilter, tierFilter, sortField]);

  const stats = useMemo(() => ({ total: allContacts.length, byTier: [1,2,3,4].map(t => allContacts.filter(c => (c.tier ?? 3) === t).length) }), [allContacts]);

  if (!loaded) return <div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;

  return (
    <div data-testid="contacts-page" className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-muted-foreground" />
            {messages.nav?.contacts ?? "Contacts"}
          </h1>
          <button data-testid="contacts-create-button" onClick={() => { resetForm(); setShowCreateForm(true); }} className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Contact
          </button>
        </div>
        <p className="text-[13px] text-muted-foreground">Manage your network across all sources, track communication patterns</p>

        {activeSources.length > 2 && (
          <div className="flex items-center gap-1 mt-4 overflow-x-auto pb-0.5">
            {activeSources.map(source => {
              const cfg = SOURCE_CONFIG[source]; const count = sourceCounts[source]; const active = sourceFilter === source;
              return (<button key={source} onClick={() => setSourceFilter(source)} className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${active ? "bg-foreground text-primary-foreground border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"}`}>
                <span className={active ? "" : cfg.color}>{cfg.icon}</span> {cfg.label} <span className={`text-[10px] ${active ? "opacity-70" : "opacity-50"}`}>{count}</span>
              </button>);
            })}
            {nativeLoading && <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading Mac contacts...</div>}
          </div>
        )}

        {allContacts.length > 0 && (
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Users className="w-3.5 h-3.5" /><span className="font-medium text-foreground">{stats.total}</span> contacts</div>
            <div className="w-px h-4 bg-border" />
            {[1,2,3,4].map(tier => { const count = stats.byTier[tier - 1]; if (count === 0) return null; const colors = TIER_COLORS[tier]; return (
              <button key={tier} onClick={() => setTierFilter(tierFilter === tier ? "all" : (tier as TierFilter))} className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all ${tierFilter === tier ? `${colors.bg} ${colors.text} ${colors.border}` : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {count} {TIER_LABELS[tier]}
              </button>);
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input data-testid="contacts-search-input" type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <button onClick={() => setShowFilters(!showFilters)} className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Sort <ChevronDown className="w-3 h-3" />
              </button>
              {showFilters && (<>
                <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]">
                  {([["label","Name"],["tone_score","Tone Score"],["messages","Messages"],["recent","Recently Updated"]] as [SortField, string][]).map(([field, label]) => (
                    <button key={field} onClick={() => { setSortField(field); setShowFilters(false); }} className={`w-full text-left text-[12px] px-3 py-1.5 transition-colors ${sortField === field ? "text-foreground font-medium bg-muted/50" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}>{label}</button>
                  ))}
                </div>
              </>)}
            </div>
            <div className="flex items-center bg-muted rounded-lg p-0.5">
              <button onClick={() => setView("grid")} className={`p-1.5 rounded-md transition-all ${view === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
              <button onClick={() => setView("list")} className={`p-1.5 rounded-md transition-all ${view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><List className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length === 0 ? <EmptyState hasContacts={allContacts.length > 0} nativeEnabled={nativeEnabled} onAddClick={() => { resetForm(); setShowCreateForm(true); }} />
          : view === "grid" ? <GridView contacts={filtered} onSelect={setSelectedContact} onEdit={openEditForm} />
          : <ListView contacts={filtered} onSelect={setSelectedContact} onEdit={openEditForm} />}
      </div>

      {selectedContact && <ContactDetailPanel contact={selectedContact} onClose={() => setSelectedContact(null)} onEdit={() => { openEditForm(selectedContact); setSelectedContact(null); }} onDelete={selectedContact.source === "manual" ? deleteContact : undefined} />}
      {showCreateForm && <ContactFormModal isEdit={!!editingContact} label={formLabel} email={formEmail} phone={formPhone} company={formCompany} role={formRole} tier={formTier} topics={formTopics} notes={formNotes} emoji={formEmoji} creating={creating} onLabelChange={setFormLabel} onEmailChange={setFormEmail} onPhoneChange={setFormPhone} onCompanyChange={setFormCompany} onRoleChange={setFormRole} onTierChange={setFormTier} onTopicsChange={setFormTopics} onNotesChange={setFormNotes} onEmojiChange={setFormEmoji} onSubmit={editingContact ? updateContact : createContact} onClose={resetForm} />}
      {toast && <div data-testid="contacts-toast" className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 ${toast.type === "success" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20" : "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/20"}`}>{toast.text}</div>}
    </div>
  );
}

/* ── Empty State ── */
function EmptyState({ hasContacts, nativeEnabled, onAddClick }: { hasContacts: boolean; nativeEnabled: boolean; onAddClick: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-12">
      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4"><Users className="w-6 h-6 text-muted-foreground" /></div>
      <h2 className="text-[15px] font-semibold text-foreground mb-1">{hasContacts ? "No matches found" : "No contacts yet"}</h2>
      <p className="text-[13px] text-muted-foreground mb-4 max-w-xs">{hasContacts ? "Try adjusting your search or filters" : nativeEnabled ? "Your Mac Contacts integration is enabled but no contacts were found. Try adding a manual contact." : "Add contacts manually or enable Mac Contacts integration in Settings \u203A Integrations"}</p>
      {!hasContacts && <button onClick={onAddClick} className="text-[12px] font-medium bg-foreground text-primary-foreground px-4 py-2 rounded-lg hover:bg-foreground-intense transition-colors flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Contact</button>}
    </div>
  );
}

/* ── Source Badge ── */
function SourceBadge({ source }: { source: ContactSource }) {
  const cfg = SOURCE_CONFIG[source];
  if (!cfg || source === "all" || source === "manual") return null;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${cfg.color} opacity-70`}>{cfg.icon}{cfg.label}</span>;
}

/* ── Grid View ── */
function GridView({ contacts, onSelect, onEdit }: { contacts: UnifiedContact[]; onSelect: (c: UnifiedContact) => void; onEdit: (c: UnifiedContact) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {contacts.map(contact => {
        const tier = contact.tier ?? 3; const tierColor = TIER_COLORS[tier]; const tone = toneLabel(contact.tone_score); const totalMsgs = contact.messages_sent + contact.messages_received; const isManual = contact.source === "manual";
        return (
          <div key={contact.id} data-testid="contact-card" onClick={() => onSelect(contact)} className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {contact.avatarEmoji ? <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg">{contact.avatarEmoji}</div>
                  : <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-semibold ${avatarColor(contact.id)}`}>{initials(contact.label)}</div>}
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-foreground truncate">{contact.label}</div>
                  {(contact.role || contact.company) && <div className="text-[11px] text-muted-foreground truncate">{contact.role}{contact.role && contact.company ? " \u00B7 " : ""}{contact.company}</div>}
                </div>
              </div>
              {isManual && <button onClick={e => { e.stopPropagation(); onEdit(contact); }} className="p-1 text-muted-foreground hover:text-foreground rounded-md opacity-0 group-hover:opacity-100 transition-all"><Edit3 className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${tierColor.bg} ${tierColor.text} ${tierColor.border}`}>{TIER_LABELS[tier]}</span>
              {tier === 1 && <Star className="w-3 h-3 text-amber-500" />}
              <SourceBadge source={contact.source} />
            </div>
            {totalMsgs > 0 && (
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1" title="Messages"><MessageSquare className="w-3 h-3" /><span>{totalMsgs}</span></div>
                <div className={`flex items-center gap-1 ${tone.color}`} title="Tone">{contact.tone_trend > 0 ? <TrendingUp className="w-3 h-3" /> : contact.tone_trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}<span>{Math.round(contact.tone_score * 100)}%</span></div>
                {contact.response_latency_avg_seconds > 0 && <div className="flex items-center gap-1" title="Latency"><Clock className="w-3 h-3" /><span>{formatLatency(contact.response_latency_avg_seconds)}</span></div>}
              </div>
            )}
            {totalMsgs === 0 && (contact.email || contact.phone) && (
              <div className="space-y-1 text-[11px] text-muted-foreground">
                {contact.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{contact.email}</span></div>}
                {contact.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 flex-shrink-0" /><span>{contact.phone}</span></div>}
              </div>
            )}
            {contact.topics.length > 0 && <div className="flex flex-wrap gap-1 mt-2.5">{contact.topics.slice(0, 3).map(t => <span key={t} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">{t}</span>)}{contact.topics.length > 3 && <span className="text-[10px] text-muted-foreground">+{contact.topics.length - 3}</span>}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ── List View ── */
function ListView({ contacts, onSelect, onEdit }: { contacts: UnifiedContact[]; onSelect: (c: UnifiedContact) => void; onEdit: (c: UnifiedContact) => void }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_80px_100px_80px_80px_40px] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Contact</span>
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Source</span>
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tier</span>
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Messages</span>
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Tone</span>
        <span />
      </div>
      {contacts.map(contact => {
        const tier = contact.tier ?? 3; const tierColor = TIER_COLORS[tier]; const tone = toneLabel(contact.tone_score); const totalMsgs = contact.messages_sent + contact.messages_received; const isManual = contact.source === "manual";
        return (
          <div key={contact.id} onClick={() => onSelect(contact)} className="grid grid-cols-[1fr_80px_100px_80px_80px_40px] gap-4 px-4 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/20 transition-colors group">
            <div className="flex items-center gap-3 min-w-0">
              {contact.avatarEmoji ? <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-base flex-shrink-0">{contact.avatarEmoji}</div>
                : <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 ${avatarColor(contact.id)}`}>{initials(contact.label)}</div>}
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-foreground truncate">{contact.label}</div>
                {(contact.role || contact.company) && <div className="text-[11px] text-muted-foreground truncate">{contact.role}{contact.role && contact.company ? " \u00B7 " : ""}{contact.company}</div>}
              </div>
            </div>
            <div className="flex items-center"><SourceBadge source={contact.source} />{contact.source === "manual" && <span className="text-[10px] text-muted-foreground">Manual</span>}</div>
            <div className="flex items-center"><span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${tierColor.bg} ${tierColor.text} ${tierColor.border}`}>{TIER_LABELS[tier]}</span></div>
            <div className="flex items-center justify-end text-[12px] text-muted-foreground">{totalMsgs > 0 ? totalMsgs : "\u2014"}</div>
            <div className={`flex items-center justify-end text-[12px] gap-1 ${totalMsgs > 0 ? tone.color : "text-muted-foreground"}`}>
              {totalMsgs > 0 ? <>{contact.tone_trend > 0 ? <TrendingUp className="w-3 h-3" /> : contact.tone_trend < 0 ? <TrendingDown className="w-3 h-3" /> : null}{Math.round(contact.tone_score * 100)}%</> : "\u2014"}
            </div>
            <div className="flex items-center justify-center">{isManual && <button onClick={e => { e.stopPropagation(); onEdit(contact); }} className="p-1 text-muted-foreground hover:text-foreground rounded-md opacity-0 group-hover:opacity-100 transition-all"><Edit3 className="w-3.5 h-3.5" /></button>}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Contact Detail Panel ── */
function ContactDetailPanel({ contact, onClose, onEdit, onDelete }: { contact: UnifiedContact; onClose: () => void; onEdit: () => void; onDelete?: (id: string) => void }) {
  const tier = contact.tier ?? 3; const tierColor = TIER_COLORS[tier]; const tone = toneLabel(contact.tone_score); const totalMsgs = contact.messages_sent + contact.messages_received; const isManual = contact.source === "manual"; const sourceCfg = SOURCE_CONFIG[contact.source];
  return (<>
    <div className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 animate-in fade-in duration-200" onClick={onClose} />
    <div data-testid="contact-detail-panel" className="fixed top-0 right-0 bottom-0 w-[420px] max-w-[90vw] bg-card border-l border-border z-50 animate-in slide-in-from-right duration-200 flex flex-col shadow-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="text-[13px] font-semibold text-foreground">Contact Details</span>
        <div className="flex items-center gap-1">
          {isManual && <button data-testid="contact-detail-edit-button" onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors" title="Edit"><Edit3 className="w-4 h-4" /></button>}
          {onDelete && <button data-testid="contact-detail-delete-button" onClick={() => onDelete(contact.id)} className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-all" title="Delete"><Trash2 className="w-4 h-4" /></button>}
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div className="flex items-center gap-4">
          {contact.avatarEmoji ? <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-2xl flex-shrink-0">{contact.avatarEmoji}</div>
            : <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-semibold flex-shrink-0 ${avatarColor(contact.id)}`}>{initials(contact.label)}</div>}
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-foreground leading-tight truncate">{contact.label}</h2>
            {(contact.role || contact.company) && <div className="text-[13px] text-muted-foreground truncate mt-0.5">{contact.role}{contact.role && contact.company ? " \u00B7 " : ""}{contact.company}</div>}
            <div className="mt-1.5 flex items-center gap-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${tierColor.bg} ${tierColor.text} ${tierColor.border}`}>{TIER_LABELS[tier]}</span>
              {sourceCfg && contact.source !== "manual" && <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted ${sourceCfg.color}`}>{sourceCfg.icon}{sourceCfg.label}</span>}
            </div>
          </div>
        </div>

        {(contact.email || contact.phone || contact.company) && (
          <div className="space-y-2.5">
            {contact.email && <div className="flex items-center gap-3"><Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" /><span className="text-[13px] text-foreground">{contact.email}</span></div>}
            {contact.phone && <div className="flex items-center gap-3"><Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" /><span className="text-[13px] text-foreground">{contact.phone}</span></div>}
            {contact.company && <div className="flex items-center gap-3"><Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" /><span className="text-[13px] text-foreground">{contact.company}</span></div>}
          </div>
        )}

        {contact._native && (contact._native.emails.length > 1 || contact._native.phones.length > 1) && (
          <div className="space-y-2">
            {contact._native.emails.slice(1).map((e, i) => <div key={`e${i}`} className="flex items-center gap-3"><Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" /><span className="text-[13px] text-muted-foreground">{e}</span></div>)}
            {contact._native.phones.slice(1).map((p, i) => <div key={`p${i}`} className="flex items-center gap-3"><Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" /><span className="text-[13px] text-muted-foreground">{p}</span></div>)}
          </div>
        )}

        {totalMsgs > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4 text-muted-foreground" /><span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">Communication</span></div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-muted/50 rounded-xl px-3.5 py-3"><div className="text-[20px] font-semibold text-foreground">{totalMsgs}</div><div className="text-[11px] text-muted-foreground">Total messages</div></div>
              <div className="bg-muted/50 rounded-xl px-3.5 py-3"><div className={`text-[20px] font-semibold ${tone.color}`}>{Math.round(contact.tone_score * 100)}%</div><div className="text-[11px] text-muted-foreground flex items-center gap-1">Tone{contact.tone_trend > 0 && <TrendingUp className="w-3 h-3 text-emerald-500" />}{contact.tone_trend < 0 && <TrendingDown className="w-3 h-3 text-red-500" />}</div></div>
              <div className="bg-muted/50 rounded-xl px-3.5 py-3"><div className="text-[20px] font-semibold text-foreground">{contact.messages_sent}</div><div className="text-[11px] text-muted-foreground">Sent</div></div>
              <div className="bg-muted/50 rounded-xl px-3.5 py-3"><div className="text-[20px] font-semibold text-foreground">{contact.messages_received}</div><div className="text-[11px] text-muted-foreground">Received</div></div>
            </div>
            {contact.response_latency_avg_seconds > 0 && <div className="mt-2.5 flex items-center gap-2.5 bg-muted/50 rounded-xl px-3.5 py-3"><Clock className="w-4 h-4 text-muted-foreground" /><div><div className="text-[13px] font-medium text-foreground">{formatLatency(contact.response_latency_avg_seconds)}</div><div className="text-[11px] text-muted-foreground">Avg response time</div></div></div>}
            {contact.baseline_deviation !== 0 && <div className="mt-2 text-[11px] text-muted-foreground">Baseline deviation: <span className={contact.baseline_deviation > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>{contact.baseline_deviation > 0 ? "+" : ""}{Math.round(contact.baseline_deviation * 100)}%</span></div>}
          </div>
        )}

        {contact.topics.length > 0 && <div><div className="flex items-center gap-2 mb-2.5"><Tag className="w-4 h-4 text-muted-foreground" /><span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">Topics</span></div><div className="flex flex-wrap gap-1.5">{contact.topics.map(t => <span key={t} className="inline-flex items-center bg-muted text-[11px] text-foreground px-2.5 py-1 rounded-full">{t}</span>)}</div></div>}
        {contact.notes && <div><div className="flex items-center gap-2 mb-2.5"><StickyNote className="w-4 h-4 text-muted-foreground" /><span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">Notes</span></div><div className="bg-muted/50 rounded-xl px-4 py-3"><p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{contact.notes}</p></div></div>}

        <div className="pt-2 border-t border-border">
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            {contact.source !== "manual" && <div>Source: {SOURCE_CONFIG[contact.source]?.label ?? contact.source}</div>}
            {contact.createdAt > 0 && <div>Created: {new Date(contact.createdAt).toLocaleString()}</div>}
            {contact.updatedAt > 0 && <div>Updated: {new Date(contact.updatedAt).toLocaleString()}</div>}
            <div className="font-mono">ID: {contact.id}</div>
          </div>
        </div>
      </div>
    </div>
  </>);
}

/* ── Contact Form Modal ── */
function ContactFormModal({ isEdit, label, email, phone, company, role, tier, topics, notes, emoji, creating, onLabelChange, onEmailChange, onPhoneChange, onCompanyChange, onRoleChange, onTierChange, onTopicsChange, onNotesChange, onEmojiChange, onSubmit, onClose }: { isEdit: boolean; label: string; email: string; phone: string; company: string; role: string; tier: number; topics: string; notes: string; emoji: string; creating: boolean; onLabelChange: (v: string) => void; onEmailChange: (v: string) => void; onPhoneChange: (v: string) => void; onCompanyChange: (v: string) => void; onRoleChange: (v: string) => void; onTierChange: (v: number) => void; onTopicsChange: (v: string) => void; onNotesChange: (v: string) => void; onEmojiChange: (v: string) => void; onSubmit: () => void; onClose: () => void }) {
  const inputCls = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors";
  const iconInputCls = "w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors";
  const labelCls = "text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 dark:bg-black/40 animate-in fade-in duration-200" onClick={onClose}>
      <div data-testid="contact-form-modal" className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 fade-in duration-200 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" />{isEdit ? "Edit Contact" : "New Contact"}</h3>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div><label className={labelCls}>Name *</label><input data-testid="contact-form-label-input" type="text" value={label} onChange={e => onLabelChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onClose(); }} autoFocus placeholder="Full name..." className={inputCls} /></div>
            <div><label className={labelCls}>Emoji</label><input type="text" value={emoji} onChange={e => onEmojiChange(e.target.value)} placeholder={"\uD83D\uDE42"} maxLength={4} className={`${inputCls} text-center`} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Role</label><input data-testid="contact-form-role-input" type="text" value={role} onChange={e => onRoleChange(e.target.value)} placeholder="e.g. Partner, CTO..." className={inputCls} /></div>
            <div><label className={labelCls}>Company</label><input data-testid="contact-form-company-input" type="text" value={company} onChange={e => onCompanyChange(e.target.value)} placeholder="Organization..." className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input data-testid="contact-form-email-input" type="email" value={email} onChange={e => onEmailChange(e.target.value)} placeholder="email@example.com" className={iconInputCls} /></div></div>
            <div><label className={labelCls}>Phone</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input data-testid="contact-form-phone-input" type="tel" value={phone} onChange={e => onPhoneChange(e.target.value)} placeholder="+1 234 567 890" className={iconInputCls} /></div></div>
          </div>
          <div>
            <label className={labelCls}>Tier</label>
            <div className="flex items-center gap-2">
              {[1,2,3,4].map(t => { const c = TIER_COLORS[t]; return <button key={t} onClick={() => onTierChange(t)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-all ${tier === t ? `${c.bg} ${c.text} ${c.border}` : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"}`}>{TIER_LABELS[t]}</button>; })}
            </div>
          </div>
          <div><label className={labelCls}>Topics</label><div className="relative"><Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input type="text" value={topics} onChange={e => onTopicsChange(e.target.value)} placeholder="Comma-separated: work, ai..." className={iconInputCls} /></div></div>
          <div><label className={labelCls}>Notes</label><textarea data-testid="contact-form-notes-input" value={notes} onChange={e => onNotesChange(e.target.value)} placeholder="Add notes..." rows={3} className={`${inputCls} resize-none`} /></div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="text-[12px] font-medium text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg transition-colors">Cancel</button>
          <button data-testid="contact-form-save-button" onClick={onSubmit} disabled={!label.trim() || creating} className="text-[12px] font-medium bg-foreground text-primary-foreground px-4 py-2 rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors flex items-center gap-1.5">
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEdit ? <Edit3 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isEdit ? "Save Changes" : "Create Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
