"use client";

import AppSidebar from "@/components/app-sidebar";
import { useSidebarOverrides } from "@/components/sidebar-context";

/**
 * Singleton sidebar rendered in the root layout.
 * Never unmounts across page navigations → smooth transitions.
 * Pages can register overrides (sessions, handlers) via SidebarContext.
 */
export function LayoutSidebar() {
  const { overrides } = useSidebarOverrides();

  return (
    <AppSidebar
      sessions={overrides.sessions}
      activeSessionId={overrides.activeSessionId}
      onSessionClick={overrides.onSessionClick}
      onNewSession={overrides.onNewSession}
    />
  );
}
