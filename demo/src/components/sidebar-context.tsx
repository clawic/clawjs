"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { SessionSummary } from "@/lib/app-bootstrap";

interface SidebarOverrides {
  sessions?: SessionSummary[];
  activeSessionId?: string | null;
  onSessionClick?: (sessionId: string) => void;
  onNewSession?: () => void;
}

interface SidebarContextValue {
  overrides: SidebarOverrides;
  /** Called by pages (e.g. chat) to register page-specific sidebar behaviour */
  setSidebarOverrides: (overrides: SidebarOverrides | null) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  overrides: {},
  setSidebarOverrides: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<SidebarOverrides>({});

  const setSidebarOverrides = useCallback((next: SidebarOverrides | null) => {
    setOverrides(next ?? {});
  }, []);

  return (
    <SidebarContext.Provider value={{ overrides, setSidebarOverrides }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarOverrides() {
  return useContext(SidebarContext);
}
