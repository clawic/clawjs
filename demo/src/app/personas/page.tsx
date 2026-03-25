"use client";

import { useLocale } from "@/components/locale-provider";
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, X, Shield, MessageSquare, Zap, ChevronDown } from "lucide-react";

interface Persona {
  id: string;
  name: string;
  avatar: string;
  role: string;
  systemPrompt: string;
  skills: string[];
  channels: string[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

const EMOJI_OPTIONS = [
  "\ud83e\udd16", "\ud83d\udd2c", "\u270d\ufe0f", "\ud83c\udfaf", "\ud83d\udca1", "\ud83d\ude80", "\ud83e\uddd1\u200d\ud83d\udcbb", "\ud83c\udf1f",
  "\ud83d\udcda", "\ud83c\udfa8", "\ud83d\udd27", "\ud83d\udee1\ufe0f", "\ud83c\udf0d", "\ud83e\uddec", "\ud83d\udcca", "\ud83c\udfb5",
  "\u2764\ufe0f", "\ud83e\udd14", "\ud83d\udcac", "\ud83e\udde0",
];

const CHANNEL_OPTIONS = ["Chat", "WhatsApp", "Telegram", "Email"];

export default function PersonasPage() {
  const { messages } = useLocale();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<Persona>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch("/api/personas");
      const data = await res.json();
      setPersonas(data.personas || []);
    } catch {
      /* empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  function expandCard(persona: Persona) {
    if (expandedId === persona.id) {
      setExpandedId(null);
      setEditState({});
      setShowEmojiPicker(false);
      setConfirmDeleteId(null);
      return;
    }
    setExpandedId(persona.id);
    setEditState({
      name: persona.name,
      avatar: persona.avatar,
      role: persona.role,
      systemPrompt: persona.systemPrompt,
      channels: [...persona.channels],
      isDefault: persona.isDefault,
    });
    setShowEmojiPicker(false);
    setConfirmDeleteId(null);
  }

  async function savePersona() {
    if (!expandedId) return;
    try {
      const res = await fetch("/api/personas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: expandedId, ...editState }),
      });
      const updated = await res.json();
      if (updated.error) return;
      // If default changed, refetch all
      if (editState.isDefault) {
        await fetchPersonas();
      } else {
        setPersonas((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      }
      setExpandedId(null);
      setEditState({});
    } catch {
      /* empty */
    }
  }

  async function createPersona() {
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Persona", avatar: "\ud83d\ude42", role: "Custom", systemPrompt: "", skills: [], channels: ["Chat"] }),
      });
      const persona = await res.json();
      setPersonas((prev) => [...prev, persona]);
      expandCard(persona);
    } catch {
      /* empty */
    }
  }

  async function deletePersona(id: string) {
    try {
      const res = await fetch(`/api/personas?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) return;
      setPersonas((prev) => prev.filter((p) => p.id !== id));
      if (expandedId === id) {
        setExpandedId(null);
        setEditState({});
      }
      setConfirmDeleteId(null);
    } catch {
      /* empty */
    }
  }

  function toggleChannel(channel: string) {
    const current = editState.channels || [];
    if (current.includes(channel)) {
      setEditState({ ...editState, channels: current.filter((c) => c !== channel) });
    } else {
      setEditState({ ...editState, channels: [...current, channel] });
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6" data-testid="personas-page">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{messages.nav.personas ?? "Personas"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage AI agent personas and their configurations</p>
          </div>
          <button
            data-testid="personas-new-button"
            onClick={createPersona}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New Persona
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {personas.map((persona) => {
            const isExpanded = expandedId === persona.id;
            return (
              <div
                key={persona.id}
                data-testid="persona-card"
                data-persona-id={persona.id}
                className={`bg-card rounded-xl border border-border transition-all ${isExpanded ? "md:col-span-2" : ""}`}
              >
                {/* Card header - always visible */}
                <button
                  data-testid="persona-expand-button"
                  onClick={() => expandCard(persona)}
                  className="w-full text-left p-4 flex items-start gap-3"
                >
                  <span className="text-3xl leading-none">{persona.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{persona.name}</p>
                      {persona.isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/10 text-foreground font-medium shrink-0">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{persona.role}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {persona.channels.map((ch) => (
                        <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {ch}
                        </span>
                      ))}
                      {persona.skills.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" />
                          {persona.skills.length} skills
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {/* Expanded editor */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-4 flex flex-col gap-3">
                    {/* Avatar & Name */}
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <button
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-2xl hover:bg-muted/70 transition-colors border border-border"
                        >
                          {editState.avatar}
                        </button>
                        {showEmojiPicker && (
                          <div className="absolute top-16 left-0 z-10 bg-card border border-border rounded-lg p-2 shadow-lg grid grid-cols-5 gap-1 w-[200px]">
                            {EMOJI_OPTIONS.map((em) => (
                              <button
                                key={em}
                                onClick={() => {
                                  setEditState({ ...editState, avatar: em });
                                  setShowEmojiPicker(false);
                                }}
                                className="w-8 h-8 rounded hover:bg-muted flex items-center justify-center text-lg"
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <input
                          data-testid="persona-name-input"
                          value={editState.name || ""}
                          onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                          placeholder="Persona name"
                          className="text-sm bg-muted rounded-lg px-3 py-2 text-foreground outline-none border border-border focus:border-foreground/30"
                        />
                        <input
                          data-testid="persona-role-input"
                          value={editState.role || ""}
                          onChange={(e) => setEditState({ ...editState, role: e.target.value })}
                          placeholder="Role / subtitle"
                          className="text-sm bg-muted rounded-lg px-3 py-2 text-foreground outline-none border border-border focus:border-foreground/30"
                        />
                      </div>
                    </div>

                    {/* System prompt */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                        System Prompt
                      </label>
                      <textarea
                        data-testid="persona-system-prompt-input"
                        value={editState.systemPrompt || ""}
                        onChange={(e) => setEditState({ ...editState, systemPrompt: e.target.value })}
                        placeholder="Instructions for this persona..."
                        rows={4}
                        className="w-full text-sm bg-muted rounded-lg px-3 py-2 text-foreground font-mono outline-none resize-none border border-border focus:border-foreground/30"
                      />
                    </div>

                    {/* Channels */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">
                        Channels
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {CHANNEL_OPTIONS.map((ch) => {
                          const active = (editState.channels || []).includes(ch);
                          return (
                            <button
                              key={ch}
                              data-testid={`persona-channel-${ch.toLowerCase()}`}
                              onClick={() => toggleChannel(ch)}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-muted text-muted-foreground border-border hover:text-foreground"}`}
                            >
                              <MessageSquare className="w-3 h-3 inline mr-1" />
                              {ch}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                      <button
                        data-testid="persona-default-toggle"
                        onClick={() => setEditState({ ...editState, isDefault: !editState.isDefault })}
                        className={`w-8 h-5 rounded-full transition-colors relative ${editState.isDefault ? "bg-foreground" : "bg-muted border border-border"}`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${editState.isDefault ? "left-3.5 bg-background" : "left-0.5 bg-muted-foreground/40"}`}
                        />
                      </button>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        Default persona
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div>
                        {persona.isDefault ? (
                          <span className="text-[10px] text-muted-foreground/60">Default persona cannot be deleted</span>
                        ) : confirmDeleteId === persona.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-500">Delete this persona?</span>
                            <button
                              data-testid="persona-delete-confirm"
                              onClick={() => deletePersona(persona.id)}
                              className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              data-testid="persona-delete-cancel"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            data-testid="persona-delete-button"
                            onClick={() => setConfirmDeleteId(persona.id)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setExpandedId(null);
                            setEditState({});
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          data-testid="persona-save-button"
                          onClick={savePersona}
                          className="text-xs px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {personas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No personas configured</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create one to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
