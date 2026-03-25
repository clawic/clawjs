/**
 * Cross-platform calendar abstraction.
 * Delegates to the correct backend based on the current OS.
 */

import { isMac, isWindows } from "@/lib/platform";

export type { CalendarSource, CalendarIntegrationStatus, CalendarEvent } from "./calendar-types";
import type { CalendarIntegrationStatus, CalendarEvent } from "./calendar-types";

const UNSUPPORTED_STATUS: CalendarIntegrationStatus = {
  installed: false,
  available: false,
  needsPermission: false,
  backend: "unsupported",
  calendars: [],
  selectedCalendarValid: false,
  message: "No calendar integration is available for this platform.",
};

export async function getCalendarIntegrationStatus(selectedCalendarId?: string): Promise<CalendarIntegrationStatus> {
  if (isMac) {
    const mod = await import("@/lib/apple-calendar");
    return mod.getCalendarIntegrationStatus(selectedCalendarId);
  }
  if (isWindows) {
    const mod = await import("@/lib/outlook-calendar");
    return mod.getCalendarIntegrationStatus(selectedCalendarId);
  }
  return UNSUPPORTED_STATUS;
}

export async function listRecentCalendarEvents(options?: {
  selectedCalendarId?: string;
  pastDays?: number;
  futureDays?: number;
  limit?: number;
}): Promise<CalendarEvent[]> {
  if (isMac) {
    const mod = await import("@/lib/apple-calendar");
    return mod.listRecentCalendarEvents(options);
  }
  if (isWindows) {
    const mod = await import("@/lib/outlook-calendar");
    return mod.listRecentCalendarEvents(options);
  }
  return [];
}
