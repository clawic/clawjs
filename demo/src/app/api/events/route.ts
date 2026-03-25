import { NextResponse } from "next/server";
import { generateId, readCollection, writeCollection, type CalendarEventRecord } from "@/lib/demo-store";
import { isE2EEnabled } from "@/lib/e2e";
import { getWorkspaceClaw } from "@/lib/workspace-claw";

function futureDate(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const SEED_EVENTS = [
  // ── Past events (recent history so the calendar doesn't look empty) ──
  {
    title: "Release Planning Kickoff",
    description: "Align on the next public release priorities, key milestones, and resource allocation across teams.",
    location: "Main Auditorium",
    startsAt: futureDate(-6, 10, 0),
    endsAt: futureDate(-6, 11, 30),
    attendeePersonIds: [],
  },
  {
    title: "Backend Guild Meetup",
    description: "Monthly backend guild. Topics: database migration strategy, new caching layer proposal.",
    location: "Conference Room C",
    startsAt: futureDate(-5, 14, 0),
    endsAt: futureDate(-5, 15, 0),
    attendeePersonIds: [],
  },
  {
    title: "Design Critique: Onboarding Flow",
    description: "Review the new onboarding screens. Discuss copy, illustrations, and accessibility improvements.",
    location: "Design Lab",
    startsAt: futureDate(-4, 11, 0),
    endsAt: futureDate(-4, 12, 0),
    attendeePersonIds: [],
  },
  {
    title: "Security Review",
    description: "Quarterly security audit review. Go through pen-test findings and remediation plan.",
    location: "Virtual (Zoom)",
    startsAt: futureDate(-3, 15, 0),
    endsAt: futureDate(-3, 16, 30),
    attendeePersonIds: [],
  },
  {
    title: "Lunch & Learn: GraphQL Best Practices",
    description: "Informal talk on schema design, N+1 queries, and DataLoader patterns.",
    location: "Kitchen / Lounge",
    startsAt: futureDate(-2, 12, 30),
    endsAt: futureDate(-2, 13, 30),
    attendeePersonIds: [],
  },
  {
    title: "Product Sync",
    description: "Weekly product sync. Review metrics dashboard, discuss feature prioritization for next sprint.",
    location: "Conference Room A",
    startsAt: futureDate(-1, 10, 0),
    endsAt: futureDate(-1, 10, 45),
    attendeePersonIds: [],
  },
  {
    title: "1:1 with Manager",
    description: "Weekly sync. Topics: project timeline update, hiring plan, and conference approval.",
    location: "Virtual (Teams)",
    startsAt: futureDate(-1, 16, 0),
    endsAt: futureDate(-1, 16, 30),
    attendeePersonIds: [],
  },

  // ── Today ──
  {
    title: "Daily Standup",
    description: "Quick sync: what you did yesterday, what you're doing today, any blockers.",
    location: "Slack Huddle",
    startsAt: futureDate(0, 9, 15),
    endsAt: futureDate(0, 9, 30),
    attendeePersonIds: [],
  },
  {
    title: "Code Review Session",
    description: "Review open PRs together. Focus on the auth refactor and the new notification service.",
    location: "Conference Room B",
    startsAt: futureDate(0, 11, 0),
    endsAt: futureDate(0, 12, 0),
    attendeePersonIds: [],
  },
  {
    title: "Lunch with Marketing",
    description: "Cross-team lunch to align on launch messaging and developer docs timeline.",
    location: "Cafeteria",
    startsAt: futureDate(0, 13, 0),
    endsAt: futureDate(0, 14, 0),
    attendeePersonIds: [],
  },
  {
    title: "Release Demo - Staging Review",
    description: "Walk through the staging environment. Show the new dashboard features and API improvements before release.",
    location: "Zoom Meeting",
    startsAt: futureDate(0, 15, 0),
    endsAt: futureDate(0, 16, 0),
    attendeePersonIds: [],
  },
  {
    title: "1:1 with Manager",
    description: "Weekly sync. Topics: project timeline update, hiring plan, and conference approval.",
    location: "Virtual (Teams)",
    startsAt: futureDate(0, 16, 30),
    endsAt: futureDate(0, 17, 0),
    attendeePersonIds: [],
  },

  // ── Tomorrow (+1) ──
  {
    title: "Sprint Planning",
    description: "Review backlog, assign stories, and set sprint goal for the upcoming sprint.",
    location: "Conference Room B",
    startsAt: futureDate(1, 10, 0),
    endsAt: futureDate(1, 11, 30),
    attendeePersonIds: [],
  },
  {
    title: "Architecture Review: Event System",
    description: "Deep dive into the new event-driven architecture. Review sequence diagrams and failure modes.",
    location: "Whiteboard Room",
    startsAt: futureDate(1, 14, 0),
    endsAt: futureDate(1, 15, 30),
    attendeePersonIds: [],
  },

  // ── +2 days ──
  {
    title: "QA Handoff",
    description: "Walk QA through the new features. Provide test accounts, edge cases to cover, and known limitations.",
    location: "Virtual (Google Meet)",
    startsAt: futureDate(2, 10, 0),
    endsAt: futureDate(2, 10, 45),
    attendeePersonIds: [],
  },
  {
    title: "Design Review: Navigation Overhaul",
    description: "Review updated wireframes from Carol. Discuss navigation flow changes based on user testing feedback.",
    location: "Design Lab",
    startsAt: futureDate(2, 14, 0),
    endsAt: futureDate(2, 15, 0),
    attendeePersonIds: [],
  },

  // ── +3 days ──
  {
    title: "All-Hands Meeting",
    description: "Company all-hands. CEO update, department highlights, Q&A session.",
    location: "Main Auditorium",
    startsAt: futureDate(3, 11, 0),
    endsAt: futureDate(3, 12, 0),
    attendeePersonIds: [],
  },
  {
    title: "Pair Programming: API Refactor",
    description: "Pair on the REST → gRPC migration for the payments service. Bring your laptop.",
    location: "Dev Corner",
    startsAt: futureDate(3, 14, 0),
    endsAt: futureDate(3, 16, 0),
    attendeePersonIds: [],
  },

  // ── +4 days ──
  {
    title: "Customer Feedback Review",
    description: "Go through latest NPS results and support tickets. Identify top pain points for next sprint.",
    location: "Conference Room A",
    startsAt: futureDate(4, 10, 0),
    endsAt: futureDate(4, 11, 0),
    attendeePersonIds: [],
  },
  {
    title: "Infra Office Hours",
    description: "Open office hours with the infra team. Bring your deployment questions and scaling concerns.",
    location: "Virtual (Slack Huddle)",
    startsAt: futureDate(4, 15, 0),
    endsAt: futureDate(4, 16, 0),
    attendeePersonIds: [],
  },

  // ── +5 days ──
  {
    title: "Team Retrospective",
    description: "End-of-sprint retro. What went well, what to improve, action items for next sprint.",
    location: "Conference Room A",
    startsAt: futureDate(5, 15, 0),
    endsAt: futureDate(5, 16, 0),
    attendeePersonIds: [],
  },

  // ── +6 days ──
  {
    title: "Hackathon Kickoff",
    description: "Quarterly hackathon begins! Form teams, pitch ideas, and start building.",
    location: "Open Space / All Floors",
    startsAt: futureDate(6, 9, 0),
    endsAt: futureDate(6, 18, 0),
    attendeePersonIds: [],
  },

  // ── +7 days ──
  {
    title: "Hackathon Demos & Judging",
    description: "Present your hackathon projects. Judges score on creativity, impact, and technical execution.",
    location: "Main Auditorium",
    startsAt: futureDate(7, 14, 0),
    endsAt: futureDate(7, 16, 0),
    attendeePersonIds: [],
  },
];

async function seedEvents() {
  const claw = await getWorkspaceClaw();
  const results = [];
  for (const evt of SEED_EVENTS) {
    const created = await claw.events.create(evt);
    results.push(created);
  }
  return results;
}

interface EventResponse {
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

function eventToResponse(evt: {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt?: string;
  attendeePersonIds: string[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  reminders: unknown[];
}): EventResponse {
  return {
    id: evt.id,
    title: evt.title,
    description: evt.description ?? "",
    location: evt.location ?? "",
    startsAt: new Date(evt.startsAt).getTime(),
    endsAt: evt.endsAt ? new Date(evt.endsAt).getTime() : null,
    attendeePersonIds: evt.attendeePersonIds,
    linkedTaskIds: evt.linkedTaskIds,
    linkedNoteIds: evt.linkedNoteIds,
    reminders: evt.reminders,
    createdAt: new Date(evt.createdAt).getTime(),
    updatedAt: new Date(evt.updatedAt).getTime(),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const upcomingOnly = searchParams.get("upcoming") !== "false";
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

  if (isE2EEnabled()) {
    const now = Date.now();
    let events = readCollection<CalendarEventRecord>("calendar-events");
    if (upcomingOnly) {
      events = events.filter((event) => (event.endsAt ?? event.startsAt) >= now);
    }
    events = [...events].sort((a, b) => a.startsAt - b.startsAt).slice(0, limit);
    return NextResponse.json({ events });
  }

  const claw = await getWorkspaceClaw();
  let events = await claw.events.list({
    upcomingOnly,
    limit,
  });

  if (events.length === 0) {
    events = await seedEvents();
  }

  const mapped: EventResponse[] = events.map(eventToResponse);
  mapped.sort((a, b) => a.startsAt - b.startsAt);

  return NextResponse.json({ events: mapped });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (isE2EEnabled()) {
    if (!body.title || !body.startsAt) {
      return NextResponse.json(
        { error: "title and startsAt are required" },
        { status: 400 },
      );
    }

    const now = Date.now();
    const event: CalendarEventRecord = {
      id: generateId(),
      title: String(body.title),
      description: typeof body.description === "string" ? body.description : "",
      location: typeof body.location === "string" ? body.location : "",
      startsAt: typeof body.startsAt === "number" ? body.startsAt : new Date(body.startsAt).getTime(),
      endsAt: body.endsAt == null
        ? null
        : typeof body.endsAt === "number"
          ? body.endsAt
          : new Date(body.endsAt).getTime(),
      attendeePersonIds: Array.isArray(body.attendeePersonIds) ? body.attendeePersonIds : [],
      linkedTaskIds: Array.isArray(body.linkedTaskIds) ? body.linkedTaskIds : [],
      linkedNoteIds: Array.isArray(body.linkedNoteIds) ? body.linkedNoteIds : [],
      reminders: Array.isArray(body.reminders) ? body.reminders : [],
      createdAt: now,
      updatedAt: now,
    };
    writeCollection("calendar-events", [...readCollection<CalendarEventRecord>("calendar-events"), event]);
    return NextResponse.json(event, { status: 201 });
  }

  const claw = await getWorkspaceClaw();

  if (!body.title || !body.startsAt) {
    return NextResponse.json(
      { error: "title and startsAt are required" },
      { status: 400 },
    );
  }

  const event = await claw.events.create({
    title: body.title,
    startsAt:
      typeof body.startsAt === "number"
        ? new Date(body.startsAt).toISOString()
        : body.startsAt,
    endsAt: body.endsAt
      ? typeof body.endsAt === "number"
        ? new Date(body.endsAt).toISOString()
        : body.endsAt
      : undefined,
    description: body.description,
    location: body.location,
    attendeePersonIds: body.attendeePersonIds ?? [],
  });

  return NextResponse.json(eventToResponse(event), { status: 201 });
}

export async function PUT(request: Request) {
  const body = await request.json();

  if (isE2EEnabled()) {
    if (!body.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const events = readCollection<CalendarEventRecord>("calendar-events");
    const existing = events.find((event) => event.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated: CalendarEventRecord = {
      ...existing,
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.location !== undefined ? { location: String(body.location) } : {}),
      ...(body.startsAt !== undefined
        ? { startsAt: typeof body.startsAt === "number" ? body.startsAt : new Date(body.startsAt).getTime() }
        : {}),
      ...(body.endsAt !== undefined
        ? {
            endsAt: body.endsAt == null
              ? null
              : typeof body.endsAt === "number"
                ? body.endsAt
                : new Date(body.endsAt).getTime(),
          }
        : {}),
      ...(body.attendeePersonIds !== undefined ? { attendeePersonIds: body.attendeePersonIds } : {}),
      updatedAt: Date.now(),
    };
    writeCollection(
      "calendar-events",
      events.map((event) => event.id === updated.id ? updated : event),
    );
    return NextResponse.json(updated);
  }

  const claw = await getWorkspaceClaw();

  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const existing = await claw.events.get(body.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.location !== undefined) updates.location = body.location;
  if (body.startsAt !== undefined) {
    updates.startsAt =
      typeof body.startsAt === "number"
        ? new Date(body.startsAt).toISOString()
        : body.startsAt;
  }
  if (body.endsAt !== undefined) {
    updates.endsAt =
      typeof body.endsAt === "number"
        ? new Date(body.endsAt).toISOString()
        : body.endsAt;
  }
  if (body.attendeePersonIds !== undefined) {
    updates.attendeePersonIds = body.attendeePersonIds;
  }

  const updated = await claw.events.update(body.id, updates);
  return NextResponse.json(eventToResponse(updated));
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (isE2EEnabled()) {
    const events = readCollection<CalendarEventRecord>("calendar-events");
    if (!events.some((event) => event.id === id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    writeCollection("calendar-events", events.filter((event) => event.id !== id));
    return NextResponse.json({ ok: true });
  }

  const claw = await getWorkspaceClaw();
  const removed = await claw.events.remove(id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
