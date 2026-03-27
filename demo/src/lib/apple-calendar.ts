import { execFile } from "child_process";
import { ALL_CALENDARS_ID } from "./calendar-constants";
import type { CalendarSource, CalendarIntegrationStatus, CalendarEvent } from "./calendar-types";

export type { CalendarSource, CalendarIntegrationStatus, CalendarEvent } from "./calendar-types";

interface CalendarMockPayload {
  calendars?: CalendarSource[];
  events?: CalendarEvent[];
  message?: string | null;
  installed?: boolean;
  available?: boolean;
  needsPermission?: boolean;
}

import { hasBinary as checkCommand } from "@/lib/platform";

function execOsa(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", args, { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function parseMockPayload(): CalendarMockPayload | null {
  const raw = process.env.CLAWJS_CALENDAR_MOCK;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CalendarMockPayload;
  } catch {
    return null;
  }
}

function isPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return normalized.includes("-1743")
    || normalized.includes("not authorized")
    || normalized.includes("not permitted")
    || normalized.includes("privilege violation");
}

function buildMockStatus(selectedCalendarId?: string): CalendarIntegrationStatus {
  const mock = parseMockPayload() || {};
  const calendars = Array.isArray(mock.calendars) ? mock.calendars : [];
  const hasSelectedCalendar = !selectedCalendarId
    || selectedCalendarId === ALL_CALENDARS_ID
    || calendars.some((calendar) => calendar.id === selectedCalendarId);

  return {
    installed: mock.installed ?? true,
    available: mock.available ?? calendars.length > 0,
    needsPermission: mock.needsPermission ?? false,
    backend: "mock",
    calendars,
    selectedCalendarValid: hasSelectedCalendar,
    message: mock.message ?? (calendars.length > 0
      ? "Calendar.app mock is ready."
      : "No mock calendars are configured."),
  };
}

async function listNativeCalendars(): Promise<CalendarSource[]> {
  const script = `
function safeString(value) {
  return value === null || value === undefined ? "" : String(value);
}

function safeId(calendar, index) {
  try { var id = calendar.id(); if (id) return safeString(id); } catch (_e) { /* id() broken on macOS 26+ */ }
  return safeString(calendar.name()) + "::" + index;
}

function run() {
  const app = Application("Calendar");
  const calendars = app.calendars();
  const output = [];

  for (let index = 0; index < calendars.length; index += 1) {
    const calendar = calendars[index];
    const title = safeString(calendar.name());
    output.push({
      id: safeId(calendar, index),
      title,
      writable: Boolean(calendar.writable()),
    });
  }

  return JSON.stringify(output);
}
`;

  const raw = await execOsa(["-l", "JavaScript", "-e", script]);
  const parsed = JSON.parse(raw) as CalendarSource[];

  // Deduplicate calendars with the same title (e.g. "Birthdays" from multiple accounts).
  // Keep the first occurrence of each title.
  const seen = new Set<string>();
  return parsed.filter((calendar) => {
    if (!calendar.id || !calendar.title) return false;
    if (seen.has(calendar.title)) return false;
    seen.add(calendar.title);
    return true;
  });
}

export async function getCalendarIntegrationStatus(selectedCalendarId?: string): Promise<CalendarIntegrationStatus> {
  const mock = parseMockPayload();
  if (mock) {
    return buildMockStatus(selectedCalendarId);
  }

  if (process.platform !== "darwin") {
    return {
      installed: false,
      available: false,
      needsPermission: false,
      backend: "unsupported",
      calendars: [],
      selectedCalendarValid: false,
      message: "Calendar.app integration is only available on macOS.",
    };
  }

  const osascriptAvailable = await checkCommand("osascript");
  if (!osascriptAvailable) {
    return {
      installed: false,
      available: false,
      needsPermission: false,
      backend: "unsupported",
      calendars: [],
      selectedCalendarValid: false,
      message: "osascript is not available on this Mac.",
    };
  }

  try {
    const calendars = await listNativeCalendars();
    const selectedCalendarValid = !selectedCalendarId
      || selectedCalendarId === ALL_CALENDARS_ID
      || calendars.some((calendar) => calendar.id === selectedCalendarId);

    return {
      installed: true,
      available: calendars.length > 0,
      needsPermission: false,
      backend: "apple-calendar",
      calendars,
      selectedCalendarValid,
      message: calendars.length === 0
        ? "Open Calendar.app and make sure at least one calendar is visible."
        : !selectedCalendarValid
          ? "Choose one of the calendars detected in Calendar.app."
          : "Calendar.app is connected on this Mac.",
    };
  } catch (error) {
    if (isPermissionError(error)) {
      return {
        installed: true,
        available: false,
        needsPermission: true,
        backend: "apple-calendar",
        calendars: [],
        selectedCalendarValid: false,
        message: "Allow Calendar access for ClawJS in macOS Privacy & Security.",
      };
    }

    return {
      installed: true,
      available: false,
      needsPermission: false,
      backend: "apple-calendar",
      calendars: [],
      selectedCalendarValid: false,
      message: error instanceof Error ? error.message : "Could not read Calendar.app.",
    };
  }
}

function filterMockEvents(events: CalendarEvent[], selectedCalendarId: string, startMs: number, endMs: number): CalendarEvent[] {
  return events
    .filter((event) => selectedCalendarId === ALL_CALENDARS_ID || event.calendarId === selectedCalendarId)
    .filter((event) => {
      const start = Date.parse(event.start);
      const end = Date.parse(event.end);
      return Number.isFinite(start) && Number.isFinite(end) && start < endMs && end > startMs;
    })
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

export async function listRecentCalendarEvents(options?: {
  selectedCalendarId?: string;
  pastDays?: number;
  futureDays?: number;
  limit?: number;
}): Promise<CalendarEvent[]> {
  const selectedCalendarId = options?.selectedCalendarId || ALL_CALENDARS_ID;
  const pastDays = options?.pastDays ?? 3;
  const futureDays = options?.futureDays ?? 1;
  const limit = options?.limit ?? 50;
  const now = Date.now();
  const startMs = now - pastDays * 24 * 3600 * 1000;
  const endMs = now + futureDays * 24 * 3600 * 1000;

  const mock = parseMockPayload();
  if (mock) {
    const events = filterMockEvents(Array.isArray(mock.events) ? mock.events : [], selectedCalendarId, startMs, endMs);
    return limit > 0 ? events.slice(0, limit) : events;
  }

  if (process.platform !== "darwin") return [];
  if (!await checkCommand("osascript")) return [];

  const script = `
function safeString(value) {
  return value === null || value === undefined ? "" : String(value);
}

function safeBoolean(fn) {
  try {
    return Boolean(fn());
  } catch (_error) {
    return false;
  }
}

function safeId(calendar, index) {
  try { var id = calendar.id(); if (id) return safeString(id); } catch (_e) { /* id() broken on macOS 26+ */ }
  return safeString(calendar.name()) + "::" + index;
}

function toIso(value) {
  if (!value) return "";
  if (typeof value.toISOString === "function") return value.toISOString();
  return new Date(value).toISOString();
}

function run(argv) {
  const startMs = Number(argv[0]);
  const endMs = Number(argv[1]);
  const selectedCalendarId = argv[2];
  const limit = Number(argv[3]);
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);
  const app = Application("Calendar");
  const calendars = app.calendars();
  const selected = [];

  for (let index = 0; index < calendars.length; index += 1) {
    const calendar = calendars[index];
    const calendarTitle = safeString(calendar.name());
    const calendarId = safeId(calendar, index);

    if (selectedCalendarId === "__all__" || selectedCalendarId === "" || selectedCalendarId === calendarId) {
      selected.push({ calendar, calendarId, calendarTitle });
    }
  }

  if (selected.length === 0) {
    for (let index = 0; index < calendars.length; index += 1) {
      const calendar = calendars[index];
      const calendarTitle = safeString(calendar.name());
      selected.push({
        calendar,
        calendarId: safeString(calendarTitle + "::" + index),
        calendarTitle,
      });
    }
  }

  const events = [];

  for (let calendarIndex = 0; calendarIndex < selected.length; calendarIndex += 1) {
    const current = selected[calendarIndex];
    const items = current.calendar.events();

    for (let eventIndex = 0; eventIndex < items.length; eventIndex += 1) {
      const event = items[eventIndex];
      const start = event.startDate();
      const end = event.endDate();

      if (!start || !end) continue;
      if (start >= endDate || end <= startDate) continue;

      events.push({
        uid: safeString(event.uid()),
        calendarId: current.calendarId,
        calendarTitle: current.calendarTitle,
        summary: safeString(event.summary()),
        location: safeString(event.location()),
        description: safeString(event.description()),
        start: toIso(start),
        end: toIso(end),
        allDay: safeBoolean(() => event.alldayEvent()),
      });
    }
  }

  events.sort((left, right) => new Date(left.start) - new Date(right.start));

  return JSON.stringify(limit > 0 ? events.slice(0, limit) : events);
}
`;

  try {
    const raw = await execOsa([
      "-l",
      "JavaScript",
      "-e",
      script,
      String(startMs),
      String(endMs),
      selectedCalendarId,
      String(limit),
    ]);

    return JSON.parse(raw) as CalendarEvent[];
  } catch (error) {
    if (isPermissionError(error)) {
      return [];
    }

    console.error("[calendar] Failed to read Calendar.app:", error);
    return [];
  }
}
