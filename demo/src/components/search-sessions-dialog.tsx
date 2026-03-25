"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useLocale } from "@/components/locale-provider";
import type { SessionSummary } from "@/lib/app-bootstrap";

interface SearchSessionsDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
}

/** Stagger delay per result item (ms) */
const STAGGER_MS = 50;

export default function SearchSessionsDialog({ open, onClose, onSelectSession }: SearchSessionsDialogProps) {
  const { messages } = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks how many result items are currently visible (for stagger animation)
  const [visibleCount, setVisibleCount] = useState(0);
  const staggerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsInnerRef = useRef<HTMLDivElement>(null);
  const [resultsHeight, setResultsHeight] = useState(0);
  const maxResultsHeight = typeof window !== "undefined" ? window.innerHeight * 0.45 : 400;

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setVisibleCount(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Stagger items in one by one whenever results change
  useEffect(() => {
    if (staggerRef.current) clearInterval(staggerRef.current);
    if (results.length === 0) { setVisibleCount(0); return; }
    setVisibleCount(0);
    let count = 0;
    staggerRef.current = setInterval(() => {
      count++;
      setVisibleCount(count);
      if (count >= results.length && staggerRef.current) {
        clearInterval(staggerRef.current);
        staggerRef.current = null;
      }
    }, STAGGER_MS);
    return () => { if (staggerRef.current) clearInterval(staggerRef.current); };
  }, [results]);

  // Measure inner content height so the wrapper can animate smoothly
  useEffect(() => {
    const el = resultsInnerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setResultsHeight(el.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/sessions/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (Array.isArray(data.results)) {
        setResults(data.results);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 250);
  }, [search]);

  const handleSelect = useCallback((sessionId: string) => {
    onClose();
    onSelectSession(sessionId);
  }, [onClose, onSelectSession]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4" onClick={onClose}>
        <div
          className="bg-card rounded-xl border border-border shadow-[0_8px_40px_rgba(0,0,0,0.08)] max-w-[440px] w-full overflow-hidden"
          style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              placeholder={messages.chat.searchPlaceholder}
              className="flex-1 text-sm text-foreground placeholder:text-muted-foreground bg-transparent outline-none"
            />
            {loading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 animate-spin text-muted-foreground">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
          </div>

          {/* Results — outer clip + animated height, inner holds actual content */}
          <div
            className="overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
            style={{ maxHeight: resultsHeight > 0 ? Math.min(resultsHeight, maxResultsHeight) : 0 }}
          >
            <div ref={resultsInnerRef} className="overflow-y-auto" style={{ maxHeight: maxResultsHeight }}>
              {query.trim() && !loading && results.length === 0 && (
                <div className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  {messages.chat.noResults}
                </div>
              )}
              {results.map((session, i) => {
                const visible = i < visibleCount;
                return (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => handleSelect(session.sessionId)}
                    className="w-full text-left px-5 py-3 hover:bg-muted transition-all duration-200 ease-out border-b border-muted last:border-b-0"
                    style={{
                      opacity: visible ? 1 : 0,
                      transform: visible ? "translateY(0)" : "translateY(6px)",
                    }}
                  >
                    <div className="text-sm text-foreground truncate">{session.title}</div>
                    {session.preview && (
                      <div className="text-[12px] text-muted-foreground truncate mt-0.5">{session.preview}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
