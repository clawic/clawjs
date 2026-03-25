"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Clock,
  MapPin,
  Users,
  Link2,
  X,
  Trash2,
  MoreHorizontal,
} from "lucide-react";

/* ── Types ── */

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: number;
  endsAt: number | null;
  attendeePersonIds: string[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  reminders: unknown[];
  createdAt: number;
  updatedAt: number;
}

type ViewMode = "month" | "week" | "day";

/* ── Date helpers ── */

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDateShort(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/* ── Color palette for events ── */

const EVENT_COLORS = [
  { bg: "bg-blue-500/15", border: "border-blue-500/30", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  { bg: "bg-violet-500/15", border: "border-violet-500/30", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  { bg: "bg-rose-500/15", border: "border-rose-500/30", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  { bg: "bg-cyan-500/15", border: "border-cyan-500/30", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  { bg: "bg-orange-500/15", border: "border-orange-500/30", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
];

function eventColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
}

/* ── Main Component ── */

export default function CalendarPage() {
  const { messages } = useLocale();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // New event form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("09:00");
  const [newEndTime, setNewEndTime] = useState("10:00");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Data fetching ── */

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events?upcoming=false&limit=500");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  /* ── CRUD ── */

  const createEvent = async () => {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const dateStr = newStartDate || new Date().toISOString().split("T")[0];
      const startsAt = new Date(`${dateStr}T${newStartTime}:00`).getTime();
      const endsAt = new Date(`${dateStr}T${newEndTime}:00`).getTime();

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim(),
          location: newLocation.trim(),
          startsAt,
          endsAt: endsAt > startsAt ? endsAt : startsAt + 3600000,
        }),
      });
      if (res.ok) {
        const event = await res.json();
        setEvents((prev) => [...prev, event]);
        resetCreateForm();
        setToast({ type: "success", text: "Event created" });
      }
    } catch {
      setToast({ type: "error", text: "Failed to create event" });
    }
    setCreating(false);
  };

  const deleteEvent = async (id: string) => {
    try {
      const res = await fetch(`/api/events?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== id));
        if (selectedEvent?.id === id) setSelectedEvent(null);
        setToast({ type: "success", text: "Event deleted" });
      }
    } catch {
      setToast({ type: "error", text: "Failed to delete event" });
    }
  };

  const resetCreateForm = () => {
    setShowCreateForm(false);
    setCreateDate(null);
    setNewTitle("");
    setNewDescription("");
    setNewLocation("");
    setNewStartDate("");
    setNewStartTime("09:00");
    setNewEndTime("10:00");
  };

  const openCreateForm = (date?: Date) => {
    if (date) {
      setCreateDate(date);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      setNewStartDate(`${y}-${m}-${d}`);
    } else {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      setNewStartDate(`${y}-${m}-${d}`);
    }
    setShowCreateForm(true);
  };

  /* ── Navigation ── */

  const goToday = () => setCurrentDate(new Date());

  const goPrev = () => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else if (view === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const goNext = () => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else if (view === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const headerLabel = useMemo(() => {
    if (view === "month") {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (view === "week") {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = addDays(weekStart, 6);
      const startStr = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endStr = weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${startStr} - ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
      }
      return `${startStr} - ${endStr}, ${weekEnd.getFullYear()}`;
    }
    return currentDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [currentDate, view]);

  /* ── Events for a given day ── */

  const eventsForDay = useCallback(
    (day: Date): CalendarEvent[] => {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      return events.filter((e) => {
        const start = e.startsAt;
        const end = e.endsAt ?? start + 3600000;
        return start < dayEnd && end > dayStart;
      });
    },
    [events],
  );

  /* ── Loading ── */

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" data-testid="calendar-page">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-muted-foreground" />
            {messages.nav?.calendar ?? "Calendar"}
          </h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => openCreateForm()}
              data-testid="calendar-new-event"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Event
            </button>
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Manage your schedule, link events to tasks, and coordinate with agents
        </p>

        {/* ── Navigation bar ── */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              data-testid="calendar-today"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              Today
            </button>
            <div className="flex items-center">
              <button
                onClick={goPrev}
                data-testid="calendar-prev"
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goNext}
                data-testid="calendar-next"
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <h2 className="text-[15px] font-semibold text-foreground ml-1" data-testid="calendar-header-label">
              {headerLabel}
            </h2>
          </div>

          {/* View mode switcher */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(["month", "week", "day"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                data-testid={`calendar-view-${mode}`}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${
                  view === mode
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar body ── */}
      <div className="flex-1 overflow-hidden px-6 pb-6">
        {view === "month" && (
          <MonthView
            currentDate={currentDate}
            events={events}
            eventsForDay={eventsForDay}
            onDayClick={(d) => {
              setCurrentDate(d);
              setView("day");
            }}
            onEventClick={setSelectedEvent}
            onCreateClick={openCreateForm}
          />
        )}
        {view === "week" && (
          <WeekView
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            onEventClick={setSelectedEvent}
            onSlotClick={(d) => openCreateForm(d)}
          />
        )}
        {view === "day" && (
          <DayView
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            onEventClick={setSelectedEvent}
            onSlotClick={(d) => openCreateForm(d)}
          />
        )}
      </div>

      {/* ── Event Detail Panel ── */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDelete={deleteEvent}
        />
      )}

      {/* ── Create Event Modal ── */}
      {showCreateForm && (
        <CreateEventModal
          title={newTitle}
          description={newDescription}
          location={newLocation}
          startDate={newStartDate}
          startTime={newStartTime}
          endTime={newEndTime}
          creating={creating}
          onTitleChange={setNewTitle}
          onDescriptionChange={setNewDescription}
          onLocationChange={setNewLocation}
          onStartDateChange={setNewStartDate}
          onStartTimeChange={setNewStartTime}
          onEndTimeChange={setNewEndTime}
          onCreate={createEvent}
          onClose={resetCreateForm}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          data-testid="calendar-toast"
          className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "success"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
              : "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/20"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Month View
   ════════════════════════════════════════════════════════════════════ */

function MonthView({
  currentDate,
  events,
  eventsForDay,
  onDayClick,
  onEventClick,
  onCreateClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  eventsForDay: (d: Date) => CalendarEvent[];
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onCreateClick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);

  // Build 6 weeks of days
  const weeks: Date[][] = [];
  let cursor = new Date(calendarStart);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  // Only show 5 weeks if 6th is entirely next month
  const displayWeeks =
    weeks[5][0].getMonth() !== currentDate.getMonth() &&
    weeks[4][6].getMonth() !== currentDate.getMonth()
      ? weeks.slice(0, 5)
      : weeks;

  return (
    <div className="h-full flex flex-col">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_SHORT.map((day) => (
          <div
            key={day}
            className="text-[11px] font-medium text-muted-foreground text-center py-1.5"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 flex-1 border-t border-l border-border rounded-xl overflow-hidden">
        {displayWeeks.map((week, wi) =>
          week.map((day, di) => {
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const today = isToday(day);
            const dayEvents = eventsForDay(day);

            return (
              <div
                key={`${wi}-${di}`}
                onClick={() => onDayClick(day)}
                className={`border-r border-b border-border p-1.5 cursor-pointer transition-colors group ${
                  isCurrentMonth
                    ? "bg-card hover:bg-muted/40"
                    : "bg-muted/10 hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`text-[12px] font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      today
                        ? "bg-foreground text-primary-foreground"
                        : isCurrentMonth
                          ? "text-foreground"
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateClick(day);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground rounded transition-all"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((evt) => {
                    const color = eventColor(evt.id);
                    return (
                      <button
                        key={evt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(evt);
                        }}
                        className={`w-full text-left text-[10px] leading-tight font-medium px-1.5 py-0.5 rounded-md truncate border ${color.bg} ${color.border} ${color.text} hover:opacity-80 transition-opacity`}
                      >
                        {formatTime(evt.startsAt)} {evt.title}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-muted-foreground px-1.5">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Week View
   ════════════════════════════════════════════════════════════════════ */

function WeekView({
  currentDate,
  eventsForDay,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date;
  eventsForDay: (d: Date) => CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (d: Date) => void;
}) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      // Scroll to 8am
      scrollRef.current.scrollTop = 8 * 64;
    }
  }, [currentDate]);

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-xl border border-border">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border flex-shrink-0">
        <div className="border-r border-border" />
        {days.map((day, i) => {
          const today = isToday(day);
          return (
            <div
              key={i}
              className={`text-center py-2.5 border-r border-border last:border-r-0 ${
                today ? "bg-foreground/[0.03]" : ""
              }`}
            >
              <div className="text-[10px] font-medium text-muted-foreground uppercase">
                {WEEKDAY_SHORT[i]}
              </div>
              <div
                className={`text-[18px] font-semibold mt-0.5 ${
                  today ? "text-foreground" : "text-foreground/70"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                    today ? "bg-foreground text-primary-foreground" : ""
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
          {/* Time labels + rows */}
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="h-16 border-r border-b border-border flex items-start justify-end pr-2 pt-0.5">
                <span className="text-[10px] text-muted-foreground -mt-1.5">
                  {hour === 0 ? "" : `${hour.toString().padStart(2, "0")}:00`}
                </span>
              </div>
              {days.map((day, di) => {
                const today = isToday(day);
                return (
                  <div
                    key={`${hour}-${di}`}
                    onClick={() => {
                      const d = new Date(day);
                      d.setHours(hour);
                      onSlotClick(d);
                    }}
                    className={`h-16 border-r border-b border-border last:border-r-0 cursor-pointer hover:bg-muted/30 transition-colors relative z-0 ${
                      today ? "bg-foreground/[0.02]" : ""
                    }`}
                  />
                );
              })}
            </div>
          ))}

          {/* Event overlays */}
          {days.map((day, di) => {
            const dayEvents = eventsForDay(day);
            return dayEvents.map((evt) => {
              const start = new Date(evt.startsAt);
              const end = new Date(evt.endsAt ?? evt.startsAt + 3600000);
              const startMinutes = start.getHours() * 60 + start.getMinutes();
              const endMinutes = Math.min(
                end.getHours() * 60 + end.getMinutes(),
                1440,
              );
              const duration = Math.max(endMinutes - startMinutes, 30);
              const top = (startMinutes / 60) * 64;
              const height = (duration / 60) * 64;
              const color = eventColor(evt.id);

              return (
                <button
                  key={evt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(evt);
                  }}
                  className={`absolute rounded-lg border px-2 py-1 text-left overflow-hidden hover:opacity-80 transition-opacity z-10 ${color.bg} ${color.border} ${color.text}`}
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height, 24)}px`,
                    left: `calc(60px + (100% - 60px) * ${di} / 7 + 2px)`,
                    width: `calc((100% - 60px) / 7 - 6px)`,
                  }}
                >
                  <div className="text-[10px] font-semibold truncate leading-tight">
                    {evt.title}
                  </div>
                  {height > 36 && (
                    <div className="text-[9px] opacity-70 truncate">
                      {formatTime(evt.startsAt)}
                      {evt.endsAt ? ` - ${formatTime(evt.endsAt)}` : ""}
                    </div>
                  )}
                  {height > 56 && evt.location && (
                    <div className="text-[9px] opacity-60 truncate flex items-center gap-0.5 mt-0.5">
                      <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                      {evt.location}
                    </div>
                  )}
                </button>
              );
            });
          })}

          {/* Current time indicator */}
          <CurrentTimeIndicator days={days} gutterWidth={60} />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Day View
   ════════════════════════════════════════════════════════════════════ */

function DayView({
  currentDate,
  eventsForDay,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date;
  eventsForDay: (d: Date) => CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (d: Date) => void;
}) {
  const dayEvents = eventsForDay(currentDate);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * 64;
    }
  }, [currentDate]);

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* Time grid */}
      <div className="flex-1 overflow-hidden rounded-xl border border-border flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="relative">
            {HOURS.map((hour) => (
              <div key={hour} className="relative z-0 flex h-16">
                <div className="w-16 flex-shrink-0 border-r border-b border-border flex items-start justify-end pr-2 pt-0.5">
                  <span className="text-[10px] text-muted-foreground -mt-1.5">
                    {hour === 0 ? "" : `${hour.toString().padStart(2, "0")}:00`}
                  </span>
                </div>
                <div
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setHours(hour, 0, 0, 0);
                    onSlotClick(d);
                  }}
                  className="flex-1 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
                />
              </div>
            ))}

            {/* Event overlays */}
            {dayEvents.map((evt) => {
              const start = new Date(evt.startsAt);
              const end = new Date(evt.endsAt ?? evt.startsAt + 3600000);
              const startMinutes = start.getHours() * 60 + start.getMinutes();
              const endMinutes = Math.min(
                end.getHours() * 60 + end.getMinutes(),
                1440,
              );
              const duration = Math.max(endMinutes - startMinutes, 30);
              const top = (startMinutes / 60) * 64;
              const height = (duration / 60) * 64;
              const color = eventColor(evt.id);

              const isCompact = height < 44;

              return (
                <button
                  key={evt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(evt);
                  }}
                  className={`absolute rounded-xl border px-3 text-left overflow-hidden hover:opacity-80 transition-opacity z-10 ${isCompact ? "py-1 flex items-center gap-2" : "py-2"} ${color.bg} ${color.border} ${color.text}`}
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height, 28)}px`,
                    left: "68px",
                    right: "8px",
                  }}
                >
                  {isCompact ? (
                    <>
                      <span className="text-[11px] font-semibold truncate">{evt.title}</span>
                      <span className="text-[10px] opacity-70 flex-shrink-0">
                        {formatTime(evt.startsAt)}
                        {evt.endsAt ? ` - ${formatTime(evt.endsAt)}` : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="text-[12px] font-semibold truncate">
                        {evt.title}
                      </div>
                      <div className="text-[11px] opacity-70">
                        {formatTime(evt.startsAt)}
                        {evt.endsAt ? ` - ${formatTime(evt.endsAt)}` : ""}
                      </div>
                    </>
                  )}
                  {!isCompact && height > 56 && evt.location && (
                    <div className="text-[10px] opacity-60 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {evt.location}
                    </div>
                  )}
                  {!isCompact && height > 76 && evt.description && (
                    <div className="text-[10px] opacity-50 mt-1 line-clamp-2">
                      {evt.description}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Current time indicator for day view */}
            {isToday(currentDate) && <DayCurrentTimeIndicator gutterWidth={64} />}
          </div>
        </div>
      </div>

      {/* Day sidebar - agenda */}
      <div className="w-72 flex-shrink-0 overflow-y-auto">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            Agenda
          </h3>
          {dayEvents.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              No events scheduled for this day
            </p>
          ) : (
            <div className="space-y-2">
              {dayEvents
                .sort((a, b) => a.startsAt - b.startsAt)
                .map((evt) => {
                  const color = eventColor(evt.id);
                  return (
                    <button
                      key={evt.id}
                      onClick={() => onEventClick(evt)}
                      className="w-full text-left group"
                    >
                      <div className="flex gap-2.5">
                        <div className={`w-1 rounded-full flex-shrink-0 mt-0.5 ${color.dot}`} style={{ minHeight: "32px" }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-medium text-foreground truncate group-hover:text-foreground-intense transition-colors">
                            {evt.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatTime(evt.startsAt)}
                            {evt.endsAt ? ` - ${formatTime(evt.endsAt)}` : ""}
                          </div>
                          {evt.location && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              {evt.location}
                            </div>
                          )}
                          {(evt.linkedTaskIds.length > 0 || evt.linkedNoteIds.length > 0) && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Link2 className="w-2.5 h-2.5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">
                                {evt.linkedTaskIds.length > 0 && `${evt.linkedTaskIds.length} task${evt.linkedTaskIds.length > 1 ? "s" : ""}`}
                                {evt.linkedTaskIds.length > 0 && evt.linkedNoteIds.length > 0 && ", "}
                                {evt.linkedNoteIds.length > 0 && `${evt.linkedNoteIds.length} note${evt.linkedNoteIds.length > 1 ? "s" : ""}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Upcoming next days */}
        <div className="bg-card border border-border rounded-xl p-4 mt-3">
          <h3 className="text-[13px] font-semibold text-foreground mb-3">
            Coming Up
          </h3>
          <div className="space-y-2">
            {[1, 2, 3].map((offset) => {
              const d = addDays(currentDate, offset);
              const upcoming = eventsForDay(d);
              if (upcoming.length === 0) return null;
              return (
                <div key={offset}>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase mb-1">
                    {d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  {upcoming.slice(0, 2).map((evt) => {
                    const color = eventColor(evt.id);
                    return (
                      <div
                        key={evt.id}
                        onClick={() => onEventClick(evt)}
                        className="flex items-center gap-2 py-1 cursor-pointer hover:opacity-70 transition-opacity"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                        <span className="text-[11px] text-foreground truncate">
                          {evt.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                          {formatTime(evt.startsAt)}
                        </span>
                      </div>
                    );
                  })}
                  {upcoming.length > 2 && (
                    <span className="text-[10px] text-muted-foreground pl-3.5">
                      +{upcoming.length - 2} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Current Time Indicator (for week view)
   ════════════════════════════════════════════════════════════════════ */

function CurrentTimeIndicator({
  days,
  gutterWidth,
}: {
  days: Date[];
  gutterWidth: number;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const todayIndex = days.findIndex((d) => isToday(d));
  if (todayIndex === -1) return null;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = (minutes / 60) * 64;

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        top: `${top}px`,
        left: `calc(${gutterWidth}px + (100% - ${gutterWidth}px) * ${todayIndex} / 7)`,
        width: `calc((100% - ${gutterWidth}px) / 7)`,
      }}
    >
      <div className="relative flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 h-[1.5px] bg-red-500" />
      </div>
    </div>
  );
}

/* ── Day Current Time Indicator ── */

function DayCurrentTimeIndicator({ gutterWidth }: { gutterWidth: number }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = (minutes / 60) * 64;

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        top: `${top}px`,
        left: `${gutterWidth}px`,
        right: 0,
      }}
    >
      <div className="relative flex items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5" />
        <div className="flex-1 h-[2px] bg-red-500" />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Event Detail Panel (slide-in from right)
   ════════════════════════════════════════════════════════════════════ */

function EventDetailPanel({
  event,
  onClose,
  onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const startDate = new Date(event.startsAt);
  const endDate = event.endsAt ? new Date(event.endsAt) : null;
  const color = eventColor(event.id);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[400px] max-w-[90vw] bg-card border-l border-border z-50 animate-in slide-in-from-right duration-200 flex flex-col shadow-2xl" data-testid="calendar-event-detail">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${color.dot}`} />
            <span className="text-[13px] font-semibold text-foreground">
              Event Details
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDelete(event.id)}
              data-testid="calendar-event-delete"
              className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-all"
              title="Delete event"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              data-testid="calendar-event-close"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Title */}
          <div>
            <h2 className="text-[18px] font-semibold text-foreground leading-tight">
              {event.title}
            </h2>
          </div>

          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[13px] text-foreground font-medium">
                {startDate.toLocaleDateString([], {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {formatTime(event.startsAt)}
                {endDate ? ` - ${formatTime(event.endsAt!)}` : ""}
                {endDate && (
                  <span className="ml-2 text-[11px]">
                    ({Math.round((event.endsAt! - event.startsAt) / 60000)} min)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-[13px] text-foreground">{event.location}</div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="bg-muted/50 rounded-xl px-4 py-3">
              <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}

          {/* Attendees */}
          {event.attendeePersonIds.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Attendees
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {event.attendeePersonIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center bg-muted text-[11px] text-foreground px-2.5 py-1 rounded-full"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Linked entities */}
          {(event.linkedTaskIds.length > 0 || event.linkedNoteIds.length > 0) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Linked Items
                </span>
              </div>
              <div className="space-y-1.5">
                {event.linkedTaskIds.map((id) => (
                  <div
                    key={id}
                    className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground"
                    >
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    <span className="text-[12px] text-foreground">Task: {id}</span>
                  </div>
                ))}
                {event.linkedNoteIds.map((id) => (
                  <div
                    key={id}
                    className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground"
                    >
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                    </svg>
                    <span className="text-[12px] text-foreground">Note: {id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reminders */}
          {event.reminders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Reminders
                </span>
              </div>
              <div className="space-y-1">
                {event.reminders.map((r: any, i) => (
                  <div
                    key={i}
                    className="text-[12px] text-foreground/70 bg-muted/50 rounded-lg px-3 py-2"
                  >
                    {r.minutesBeforeStart} min before
                    {r.channel ? ` via ${r.channel}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-2 border-t border-border">
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <div>Created: {new Date(event.createdAt).toLocaleString()}</div>
              <div>Updated: {new Date(event.updatedAt).toLocaleString()}</div>
              <div className="font-mono">ID: {event.id}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Create Event Modal
   ════════════════════════════════════════════════════════════════════ */

function CreateEventModal({
  title,
  description,
  location,
  startDate,
  startTime,
  endTime,
  creating,
  onTitleChange,
  onDescriptionChange,
  onLocationChange,
  onStartDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onCreate,
  onClose,
}: {
  title: string;
  description: string;
  location: string;
  startDate: string;
  startTime: string;
  endTime: string;
  creating: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onStartTimeChange: (v: string) => void;
  onEndTimeChange: (v: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop + centering container */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 dark:bg-black/40 animate-in fade-in duration-200"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        <div
          data-testid="calendar-create-modal"
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-muted-foreground" />
              New Event
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <div className="px-5 py-4 space-y-4">
            {/* Title */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCreate();
                  if (e.key === "Escape") onClose();
                }}
                autoFocus
                placeholder="Event title..."
                data-testid="calendar-create-title"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  data-testid="calendar-create-date"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Start
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => onStartTimeChange(e.target.value)}
                  data-testid="calendar-create-start"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  End
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => onEndTimeChange(e.target.value)}
                  data-testid="calendar-create-end"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Location
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => onLocationChange(e.target.value)}
                  placeholder="Add location..."
                  data-testid="calendar-create-location"
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Add details..."
                rows={3}
                data-testid="calendar-create-description"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <button
              onClick={onClose}
              data-testid="calendar-create-cancel"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onCreate}
              disabled={!title.trim() || creating}
              data-testid="calendar-create-submit"
              className="text-[12px] font-medium bg-foreground text-primary-foreground px-4 py-2 rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Create Event
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
