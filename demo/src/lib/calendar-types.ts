export interface CalendarSource {
  id: string;
  title: string;
  writable: boolean;
}

export type CalendarBackend = "apple-calendar" | "outlook" | "mock" | "unsupported";

export interface CalendarIntegrationStatus {
  installed: boolean;
  available: boolean;
  needsPermission: boolean;
  backend: CalendarBackend;
  calendars: CalendarSource[];
  selectedCalendarValid: boolean;
  message: string | null;
}

export interface CalendarEvent {
  uid: string;
  calendarId: string;
  calendarTitle: string;
  summary: string;
  location: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
}
