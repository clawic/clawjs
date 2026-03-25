"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useAppBootstrap } from "@/components/app-bootstrap-provider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import type { SessionSummary } from "@/lib/app-bootstrap";
import { getCachedAppBootstrap } from "@/lib/app-bootstrap";
import SearchSessionsDialog from "@/components/search-sessions-dialog";

interface AppSidebarProps {
  sessions?: SessionSummary[];
  activeSessionId?: string | null;
  onSessionClick?: (sessionId: string) => void;
  onNewSession?: () => void;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 240;

interface SidebarLink {
  href: string;
  labelKey: "contacts" | "notes" | "images" | "skills" | "tasks" | "calendar" | "routines" | "activity" | "memory" | "personas" | "usage" | "plugins" | "health" | "inbox";
  icon: React.ReactNode;
  badgeId?: string;
}

interface SidebarGroup {
  labelKey: "tools" | "workspace" | "system";
  links: SidebarLink[];
}

const sidebarGroups: SidebarGroup[] = [
  {
    labelKey: "tools",
    links: [
      { href: "/notes", labelKey: "notes", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          <path d="M8 7h6" />
          <path d="M8 11h8" />
        </svg>
      )},
      { href: "/contacts", labelKey: "contacts", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )},
      { href: "/images", labelKey: "images", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      )},
      { href: "/skills", labelKey: "skills", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      )},
    ],
  },
  {
    labelKey: "workspace",
    links: [
      { href: "/tasks", labelKey: "tasks", badgeId: "tasks_due_today", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )},
      { href: "/calendar", labelKey: "calendar", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )},
      { href: "/routines", labelKey: "routines", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )},
      { href: "/memory", labelKey: "memory", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22" />
          <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93" />
          <path d="M8.56 13a8 8 0 0 0-2.3 3.5" />
          <path d="M15.44 13a8 8 0 0 1 2.3 3.5" />
        </svg>
      )},
    ],
  },
  {
    labelKey: "system",
    links: [
      { href: "/activity", labelKey: "activity", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      )},
      { href: "/personas", labelKey: "personas", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )},
      { href: "/usage", labelKey: "usage", icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      )},
    ],
  },
];

/* ── Toggle icon: hamburger ☰ ⇄ left chevron ‹ ───────────────────
   Closed → three horizontal lines (hamburger).
   Open → top & bottom bars shorten and rotate from their LEFT edge
   to form a clean ‹ with a shared vertex. Middle bar fades out. */
function ToggleIcon({ open }: { open: boolean }) {
  const ease = "transition-all duration-300 ease-[cubic-bezier(.4,0,.2,1)]";
  return (
    <span className="relative block w-[14px] h-[10px]">
      {/* top bar → upper arm of ‹ */}
      <span
        className={`absolute h-[1.5px] bg-current rounded-full origin-left ${ease}`}
        style={{
          left: 0,
          top: 0,
          width: open ? "7px" : "14px",
          transform: open ? "translateY(4.5px) rotate(-38deg)" : "none",
        }}
      />
      {/* middle bar → fades out */}
      <span
        className={`absolute left-0 h-[1.5px] bg-current rounded-full ${ease}`}
        style={{
          top: "50%",
          width: "14px",
          transform: "translateY(-50%)",
          opacity: open ? 0 : 1,
        }}
      />
      {/* bottom bar → lower arm of ‹ */}
      <span
        className={`absolute h-[1.5px] bg-current rounded-full origin-left ${ease}`}
        style={{
          left: 0,
          bottom: 0,
          width: open ? "7px" : "14px",
          transform: open ? "translateY(-4.5px) rotate(38deg)" : "none",
        }}
      />
    </span>
  );
}

/* ── Shared link/button style for sidebar items ──────────────────── */
const ITEM_ACTIVE = "bg-muted text-foreground font-medium pl-3";
const ITEM_IDLE   = "text-tertiary-foreground hover:bg-muted hover:text-foreground active:scale-[0.98] pl-3";
const ITEM_TRANSITION = "transition-all duration-200 ease-out";

export default function AppSidebar({ sessions: externalSessions, activeSessionId, onSessionClick, onNewSession }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { bootstrapData, updateBootstrapData } = useAppBootstrap();
  const { messages } = useLocale();

  const [open, setOpen] = useState(() => getCachedAppBootstrap()?.localSettings?.sidebarOpen ?? false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollBottomGap, setScrollBottomGap] = useState(0);
  const [internalSessions, setInternalSessions] = useState<SessionSummary[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});

  // Fetch UI badges from SDK
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ui");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.badges)) {
            const map: Record<string, number> = {};
            for (const b of data.badges) {
              if (b.id && typeof b.value === "number" && b.value > 0) map[b.id] = b.value;
            }
            setBadges(map);
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const isChatPage = pathname === "/" || pathname === "/chat";
  const sessions = externalSessions ?? bootstrapData?.sessions ?? internalSessions;

  // Sessions: only highlighted on the chat page
  const resolvedActiveSessionId = isChatPage
    ? (activeSessionId ?? bootstrapData?.activeSessionId ?? null)
    : null;

  // ── Scroll fade ──
  // useLayoutEffect to calculate metrics before paint, avoiding gradient flash
  useLayoutEffect(() => {
    const el = sessionsRef.current;
    if (!el) return;
    const update = () => {
      setScrollTop(el.scrollTop);
      setScrollBottomGap(el.scrollHeight - el.scrollTop - el.clientHeight);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [sessions]);

  useEffect(() => {
    if (isChatPage) return;
    if (bootstrapData?.sessions?.length) return;
    (async () => {
      try {
        const res = await fetch("/api/chat/sessions");
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          const nextSessions = [...(data.sessions as SessionSummary[])].sort((a, b) => b.updatedAt - a.updatedAt);
          setInternalSessions(nextSessions);
          updateBootstrapData((current) => ({
            ...current,
            sessions: nextSessions,
          }));
        }
      } catch { /* ignore */ }
    })();
  }, [bootstrapData?.sessions, isChatPage, updateBootstrapData]);

  useEffect(() => {
    if (!bootstrapData) return;
    setOpen(bootstrapData.localSettings?.sidebarOpen ?? false);
  }, [bootstrapData, bootstrapData?.localSettings?.sidebarOpen]);

  const handleSessionClick = (sessionId: string) => {
    if (onSessionClick) {
      onSessionClick(sessionId);
    } else {
      updateBootstrapData((current) => ({
        ...current,
        activeSessionId: sessionId,
      }));
      router.push("/chat");
    }
  };

  const handleNewSession = useCallback(() => {
    if (onNewSession) {
      onNewSession();
    } else {
      updateBootstrapData((current) => ({
        ...current,
        activeSessionId: null,
      }));
      router.push("/chat");
    }
  }, [onNewSession, updateBootstrapData, router]);

  // Cmd+J / Ctrl+J → new session (global, works from any page)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        handleNewSession();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleNewSession]);

  const persistSidebarOpen = useCallback(async (nextOpen: boolean) => {
    updateBootstrapData((current) => ({
      ...current,
      localSettings: {
        ...current.localSettings,
        sidebarOpen: nextOpen,
      },
    }));

    try {
      const response = await fetch("/api/config/local", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarOpen: nextOpen }),
      });

      if (!response.ok) {
        throw new Error("Failed to persist sidebar preference");
      }
    } catch (error) {
      console.error(error);
    }
  }, [updateBootstrapData]);

  const handleToggle = useCallback(() => {
    const nextOpen = !open;
    setOpen(nextOpen);
    void persistSidebarOpen(nextOpen);
  }, [open, persistSidebarOpen]);

  // ── Resize drag ──
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX))));
    };

    const onMouseUp = () => {
      isResizing.current = false;
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [width]);

  return (
    <div data-testid="app-sidebar" data-state={open ? "open" : "closed"} className="relative flex h-full min-h-0 shrink-0">
      {/* ── Toggle button: slides with the sidebar edge ── */}
      <button
        type="button"
        data-testid="sidebar-toggle"
        aria-expanded={open}
        onClick={handleToggle}
        className={`absolute top-[22px] z-30 text-muted-foreground hover:text-foreground p-0.5 ${isDragging ? "" : "transition-[left,color] duration-300 ease-[cubic-bezier(.4,0,.2,1)]"}`}
        style={{ left: open ? `${width - 30}px` : "16px" }}
      >
        <ToggleIcon open={open} />
      </button>

      {/* ── Sidebar panel ── */}
      <aside
        data-testid="app-sidebar-panel"
        className={`flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card ${isDragging ? "" : "transition-all duration-300 ease-[cubic-bezier(.4,0,.2,1)]"}`}
        style={{ width: open ? width : 0, minWidth: open ? MIN_WIDTH : 0, opacity: open ? 1 : 0 }}
      >
        {/* Branding */}
        <div className="px-5 pt-5 pb-4">
          <Link prefetch={false} href="/" className="flex items-center gap-2 font-medium text-sm text-foreground tracking-tight hover:opacity-80 transition-opacity min-w-0">
            <span className="truncate whitespace-nowrap">{messages.common.appName}</span>
          </Link>
        </div>

        {/* Tool groups */}
        {sidebarGroups.map((group, gi) => (
          <div key={group.labelKey}>
            <div className="px-5 mb-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                {messages.nav[group.labelKey]}
              </span>
            </div>
            <div className={`flex flex-col gap-0.5 px-2 ${gi < sidebarGroups.length - 1 ? "mb-3" : "mb-4"}`}>
              {group.links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    data-testid={`sidebar-link-${link.labelKey}`}
                    className={`flex items-center gap-2 w-full text-left py-1.5 rounded-md text-[13px] whitespace-nowrap ${ITEM_TRANSITION} ${
                      active ? ITEM_ACTIVE : ITEM_IDLE
                    }`}
                  >
                    <span className={`shrink-0 ${ITEM_TRANSITION} ${active ? "text-strong-foreground" : "text-tertiary-foreground"}`}>{link.icon}</span>
                    <span className="truncate flex-1">{messages.nav[link.labelKey]}</span>
                    {link.badgeId && badges[link.badgeId] ? (
                      <span className="ml-auto text-[10px] font-medium bg-foreground text-primary-foreground rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {badges[link.badgeId]}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Sessions */}
        <div className="px-5 mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest whitespace-nowrap">
            {messages.chat.sessions}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              data-testid="sidebar-search-sessions"
              className="transition-[color,transform] duration-200 p-0.5 origin-center text-muted-foreground hover:text-foreground hover:scale-110"
              title={messages.chat.searchSessions}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              onClick={handleNewSession}
              data-testid="sidebar-new-session"
              className="transition-[color,transform] duration-200 p-0.5 origin-center text-muted-foreground hover:text-foreground hover:scale-110"
              title={`${messages.chat.newSession} (⌘J)`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {/* Fade gradient at top */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-card via-card/80 to-transparent transition-opacity duration-200"
            style={{ opacity: Math.min(scrollTop / 40, 1) }}
          />
          <div ref={sessionsRef} className="h-full overflow-y-auto">
            <div className={`flex flex-col gap-0.5 px-2 ${sessions.length === 0 ? "h-full" : "pb-4"}`}>
              {sessions.length === 0 ? (
                <div className="flex flex-col gap-1.5 h-full relative">
                  {/* CTA as first session card */}
                  <button
                    type="button"
                    onClick={handleNewSession}
                    className="w-full text-left px-3 rounded-md transition-all duration-200 bg-muted hover:bg-border flex items-center justify-between"
                    style={{ height: 50, flexShrink: 0 }}
                  >
                    <div className="text-[13px] font-medium flex items-center gap-1.5 text-strong-foreground">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      {messages.chat.newSession}
                    </div>
                    <span className="text-muted-foreground bg-card px-1 py-px rounded text-[9px] font-mono">&#8984;J</span>
                  </button>
                  {/* Ghost skeleton cards - overflow hidden cuts excess, no scroll */}
                  <div className="overflow-hidden flex flex-col gap-1.5" style={{ height: "100vh" }}>
                    {Array.from({ length: 20 }, (_, i) => {
                      const op = Math.max(0.5 - i * 0.02, 0.08);
                      const titleWidths = [72, 58, 80, 65, 50, 70, 76, 54, 82, 60, 68, 74, 56, 78, 62, 52, 84, 66, 72, 58];
                      const dateWidths = [38, 45, 32, 42, 28, 36, 40, 34, 44, 30, 38, 42, 35, 46, 33, 29, 41, 37, 43, 31];
                      return (
                        <div key={i} className="px-3 rounded-md bg-muted flex flex-col justify-center" style={{ opacity: op, height: 44, flexShrink: 0 }}>
                          <div className="h-2 rounded-sm bg-border" style={{ width: `${titleWidths[i]}%` }} />
                          <div className="h-1.5 rounded-sm bg-border mt-2" style={{ width: `${dateWidths[i]}%` }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.sessionId === resolvedActiveSessionId;
                  return (
                  <button
                    key={session.sessionId}
                    type="button"
                    data-testid="session-item"
                    onClick={() => handleSessionClick(session.sessionId)}
                    className={`w-full text-left py-1.5 rounded-md ${ITEM_TRANSITION} ${
                      isActive ? ITEM_ACTIVE : ITEM_IDLE
                    }`}
                  >
                    <div data-testid="session-item-title" className="text-sm truncate">{session.title}</div>
                  </button>
                  );
                })
              )}
            </div>
          </div>
          {/* Fade gradient at bottom */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-card via-card/80 to-transparent transition-opacity duration-200"
            style={{ opacity: Math.min(scrollBottomGap / 40, 1) }}
          />
        </div>

        {/* Settings */}
        <div className="px-3 pb-4 pt-0">
          <Link
            href="/settings"
            prefetch={false}
            data-testid="sidebar-link-settings"
            className={`group flex items-center gap-2 w-full px-3 py-2 rounded-md text-[13px] whitespace-nowrap transition-all duration-200 active:scale-[0.98] ${
              pathname === "/settings"
                ? "bg-muted text-foreground font-medium"
                : "text-tertiary-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="transition-transform duration-300 group-hover:rotate-45">
              <path d="M13.85 22.25h-3.7c-.74 0-1.36-.54-1.45-1.27l-.27-1.89a8.93 8.93 0 0 1-1.58-.92l-1.79.72a1.48 1.48 0 0 1-1.82-.56l-1.85-3.2a1.46 1.46 0 0 1 .37-1.82l1.52-1.17a8.7 8.7 0 0 1 0-1.84L1.76 9.13a1.46 1.46 0 0 1-.37-1.82l1.85-3.2a1.48 1.48 0 0 1 1.82-.56l1.79.72c.48-.37 1.01-.68 1.58-.92l.27-1.89A1.47 1.47 0 0 1 10.15 .19h3.7c.74 0 1.36.54 1.45 1.27l.27 1.89c.57.24 1.1.55 1.58.92l1.79-.72a1.48 1.48 0 0 1 1.82.56l1.85 3.2c.36.63.2 1.42-.37 1.82l-1.52 1.17a8.7 8.7 0 0 1 0 1.84l1.52 1.17c.57.4.73 1.19.37 1.82l-1.85 3.2a1.48 1.48 0 0 1-1.82.56l-1.79-.72c-.48.37-1.01.68-1.58.92l-.27 1.89a1.47 1.47 0 0 1-1.45 1.27zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
            </svg>
            <span className="truncate">{messages.nav.settings}</span>
          </Link>
        </div>
      </aside>

      {/* Resize handle, only when open */}
      {open && (
        <div
          onMouseDown={startResize}
          className="absolute top-0 right-0 w-3 h-full cursor-col-resize z-10 flex items-stretch justify-center"
        >
          <div className="w-[1.5px] h-full transition-colors duration-150 hover:bg-border-hover active:bg-muted-foreground pointer-events-none" />
        </div>
      )}

      <SearchSessionsDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectSession={handleSessionClick}
      />
    </div>
  );
}
