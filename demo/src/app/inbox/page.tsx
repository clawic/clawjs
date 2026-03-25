"use client";

import { useState, useCallback, useEffect } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Inbox, RefreshCw, Loader2, Mail, MessageCircle, Calendar,
  Send, Eye, EyeOff, Trash2, ChevronDown, ChevronRight,
  Filter, X,
} from "lucide-react";

interface InboxMessage {
  id: string;
  channel: string;
  from: string;
  subject?: string;
  preview: string;
  content: string;
  read: boolean;
  timestamp: number;
  threadId?: string;
}

type Channel = "all" | "whatsapp" | "telegram" | "email" | "calendar";

const CHANNELS: { key: Channel; label: string; color: string }[] = [
  { key: "all", label: "All", color: "" },
  { key: "whatsapp", label: "WhatsApp", color: "text-green-500" },
  { key: "telegram", label: "Telegram", color: "text-blue-500" },
  { key: "email", label: "Email", color: "text-violet-500" },
  { key: "calendar", label: "Calendar", color: "text-orange-500" },
];

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const base = className || "w-4 h-4";
  if (channel === "whatsapp") return <MessageCircle className={`${base} text-green-500`} />;
  if (channel === "telegram") return <Send className={`${base} text-blue-500`} />;
  if (channel === "email") return <Mail className={`${base} text-violet-500`} />;
  if (channel === "calendar") return <Calendar className={`${base} text-orange-500`} />;
  return <Inbox className={`${base} text-muted-foreground`} />;
}

export default function InboxPage() {
  const { formatDate } = useLocale();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [allMessages, setAllMessages] = useState<InboxMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox");
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages ?? [];
        setAllMessages(msgs);
      }
      setLoaded(true);
    } catch { setLoaded(true); }
  }, []);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  // Client-side filtering
  useEffect(() => {
    let filtered = [...allMessages];
    if (activeChannel !== "all") {
      filtered = filtered.filter((m) => m.channel === activeChannel);
    }
    if (unreadOnly) {
      filtered = filtered.filter((m) => !m.read);
    }
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    setMessages(filtered);
  }, [allMessages, activeChannel, unreadOnly]);

  const unreadCounts = CHANNELS.reduce<Record<string, number>>((acc, ch) => {
    if (ch.key === "all") {
      acc[ch.key] = allMessages.filter((m) => !m.read).length;
    } else {
      acc[ch.key] = allMessages.filter((m) => m.channel === ch.key && !m.read).length;
    }
    return acc;
  }, {});

  const toggleRead = async (msg: InboxMessage) => {
    const res = await fetch("/api/inbox", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: msg.id, read: !msg.read }),
    });
    if (res.ok) {
      setAllMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: !m.read } : m))
      );
    }
  };

  const deleteMessage = async (id: string) => {
    const res = await fetch(`/api/inbox?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setAllMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedId === id) setSelectedId(null);
      setToast({ type: "success", text: "Message deleted" });
    }
  };

  const selectedMsg = messages.find((m) => m.id === selectedId);

  const formatTimestamp = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return formatDate(new Date(ts), { month: "short", day: "numeric" });
  };

  return (
    <div className="h-full overflow-y-auto" data-testid="inbox-page">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Inbox className="w-5 h-5 text-muted-foreground" />
              Inbox
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Unified messages across all channels</p>
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

        {/* Channel tabs */}
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          {CHANNELS.map((ch) => (
            <button
              key={ch.key}
              data-testid={`inbox-channel-${ch.key}`}
              onClick={() => { setActiveChannel(ch.key); setSelectedId(null); }}
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeChannel === ch.key
                  ? "bg-foreground text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {ch.key !== "all" && <ChannelIcon channel={ch.key} className="w-3 h-3" />}
              {ch.label}
              {unreadCounts[ch.key] > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeChannel === ch.key
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-blue-500/15 text-blue-500"
                }`}>
                  {unreadCounts[ch.key]}
                </span>
              )}
            </button>
          ))}

          <div className="flex-1" />

          <button
            data-testid="inbox-unread-toggle"
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              unreadOnly ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Filter className="w-3 h-3" />
            Unread
          </button>
        </div>

        {/* Message list */}
        {!loaded ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Loader2 className="w-5 h-5 text-muted-foreground mx-auto animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Inbox className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-[13px] text-muted-foreground">
              {unreadOnly ? "No unread messages" : `No messages${activeChannel !== "all" ? ` in ${activeChannel}` : ""}`}
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {messages.map((msg) => {
              const isSelected = selectedId === msg.id;
              return (
                <div key={msg.id}>
                  <div
                    data-testid="inbox-message-item"
                    data-message-id={msg.id}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? "bg-muted/40" : "hover:bg-muted/20"}`}
                    onClick={() => setSelectedId(isSelected ? null : msg.id)}
                  >
                    {/* Unread dot */}
                    <div className="pt-1.5 flex-shrink-0 w-3">
                      {!msg.read && <span className="block w-2 h-2 rounded-full bg-blue-500" />}
                    </div>

                    {/* Channel icon */}
                    <div className="pt-0.5 flex-shrink-0">
                      <ChannelIcon channel={msg.channel} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] truncate ${!msg.read ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                          {msg.from}
                        </span>
                        {msg.subject && (
                          <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                            - {msg.subject}
                          </span>
                        )}
                      </div>
                      {msg.subject && (
                        <p className={`text-[12px] truncate mt-0.5 sm:hidden ${!msg.read ? "text-foreground/70" : "text-muted-foreground"}`}>
                          {msg.subject}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{msg.preview}</p>
                    </div>

                    {/* Timestamp & expand icon */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                      <span className="text-[10px] text-muted-foreground">{formatTimestamp(msg.timestamp)}</span>
                      {isSelected ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isSelected && (
                    <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/10">
                      {/* Actions */}
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          data-testid="inbox-toggle-read-button"
                          onClick={(e) => { e.stopPropagation(); toggleRead(msg); }}
                          className="text-[10px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 bg-muted hover:bg-border text-foreground transition-colors"
                        >
                          {msg.read ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {msg.read ? "Mark Unread" : "Mark Read"}
                        </button>
                        <button
                          data-testid="inbox-delete-button"
                          onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                          className="text-[10px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>

                      {/* Full message */}
                      <div className="bg-background border border-border rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <ChannelIcon channel={msg.channel} className="w-3.5 h-3.5" />
                          <span className="text-[12px] font-medium text-foreground">{msg.from}</span>
                          {msg.subject && <span className="text-[11px] text-muted-foreground">| {msg.subject}</span>}
                        </div>
                        <pre className="text-[12px] text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed">{msg.content}</pre>
                      </div>

                      {/* Reply composer */}
                      <div className="flex gap-2">
                        <textarea
                          data-testid="inbox-reply-input"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={`Reply to ${msg.from}...`}
                          rows={2}
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground resize-none"
                        />
                        <button
                          data-testid="inbox-send-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (replyText.trim()) {
                              setReplyText("");
                              setToast({ type: "success", text: "Reply sent" });
                            }
                          }}
                          disabled={!replyText.trim()}
                          className="self-end px-3 py-2 bg-foreground text-primary-foreground text-[11px] font-medium rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {loaded && allMessages.length > 0 && (
          <div className="mt-4 text-center text-[10px] text-muted-foreground/60">
            {allMessages.length} messages total | {allMessages.filter((m) => !m.read).length} unread
          </div>
        )}
      </div>
    </div>
  );
}
