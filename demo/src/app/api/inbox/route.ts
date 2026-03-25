import { NextResponse } from "next/server";
import { readCollection, writeCollection, type InboxMessage } from "@/lib/demo-store";
import { isE2EEnabled } from "@/lib/e2e";
import { getWorkspaceClaw } from "@/lib/workspace-claw";

const SEED_MESSAGES = [
  { channel: "whatsapp" as const, subject: undefined, content: "Hey, can you check the deployment status? The staging server seems to be acting up and the client demo is tomorrow morning.", participantPersonIds: ["alice-martin"] },
  { channel: "whatsapp" as const, subject: undefined, content: "Meeting moved to 3pm. The conference room on the 4th floor is booked. Please bring the Q1 report.", participantPersonIds: ["bob-chen"] },
  { channel: "whatsapp" as const, subject: undefined, content: "Sent you the updated wireframes. I changed the navigation flow based on user testing feedback. Let me know what you think.", participantPersonIds: ["carol-diaz"] },
  { channel: "telegram" as const, subject: undefined, content: "Build #482 passed all checks.\n\n- Unit tests: 342/342 passed\n- Integration: 28/28 passed\n- Coverage: 87.3%\n- Deploy ready: yes", participantPersonIds: ["devops-bot"] },
  { channel: "telegram" as const, subject: undefined, content: "CPU usage spike on prod-2 at 14:32 UTC. Peak: 94%. Current: 67%. Auto-scaling triggered. No user impact detected.", participantPersonIds: ["monitoring-alert"] },
  { channel: "telegram" as const, subject: undefined, content: "PR #127 needs your review. It's the refactor of the auth middleware we discussed last week. Pretty straightforward changes.", participantPersonIds: ["sarah-kim"] },
  { channel: "email" as const, subject: "Weekly Product Review", content: "Hi,\n\nPlease find attached the weekly product review summary. Key highlights:\n\n1. Documentation coverage improved\n2. The latest onboarding pass reduced setup friction\n3. Support ticket volume is trending down\n\nLet's discuss during our Thursday sync.\n\nBest,\nJames", participantPersonIds: ["james@example.co"] },
  { channel: "email" as const, subject: "[clawjs] Issue #89: Memory leak in worker pool", content: "New issue opened by @contributor42:\n\nWorker pool memory grows unbounded after ~200 concurrent requests. Reproduced on v2.1.3 with Node 20. Heap dump attached.\n\nLabels: bug, priority-high", participantPersonIds: ["noreply@github.com"] },
  { channel: "email" as const, subject: "Workspace Hosting Renewal", content: "Your monthly hosting renewal is ready for review.\n\nAmount: $120.00\nPeriod: March 2026\nDue: April 15, 2026\n\nView details at: https://vendor.example/invoices/2024-0891", participantPersonIds: ["lisa@vendor.example"] },
  { channel: "calendar" as const, subject: "Sprint Planning - Tomorrow 10:00 AM", content: "Sprint Planning\nTomorrow, 10:00 AM - 11:30 AM\nConference Room B\n\nAttendees: You, Alice, Bob, Sarah, Dave\nAgenda: Review backlog, assign stories, set sprint goal", participantPersonIds: ["google-calendar"] },
  { channel: "calendar" as const, subject: "1:1 with Manager", content: "Weekly 1:1 with Manager\nToday, 4:00 PM - 4:30 PM\nVirtual (Teams link)\n\nTopics to discuss:\n- Project timeline update\n- Hiring decisions\n- Conference budget approval", participantPersonIds: ["outlook-calendar"] },
  { channel: "whatsapp" as const, subject: undefined, content: "Can you share the API docs link from the public docs site? I need it for the new contributor onboarding guide.", participantPersonIds: ["dave-park"] },
];

const PARTICIPANT_DISPLAY_NAMES: Record<string, string> = {
  "alice-martin": "Alice Martin",
  "bob-chen": "Bob Chen",
  "carol-diaz": "Carol Diaz",
  "devops-bot": "DevOps Bot",
  "monitoring-alert": "Monitoring Alert",
  "sarah-kim": "Sarah Kim",
  "james@example.co": "james@example.co",
  "noreply@github.com": "noreply@github.com",
  "lisa@vendor.example": "lisa@vendor.example",
  "google-calendar": "Google Calendar",
  "outlook-calendar": "Outlook Calendar",
  "dave-park": "Dave Park",
};

async function seedInbox() {
  const claw = await getWorkspaceClaw();
  const results = [];
  for (const msg of SEED_MESSAGES) {
    const thread = await claw.inbox.ingestIncomingMessage({
      channel: msg.channel,
      content: msg.content,
      subject: msg.subject,
      participantPersonIds: msg.participantPersonIds,
    });
    results.push(thread);
  }
  return results;
}

function threadToMessage(thread: {
  id: string;
  channel: string;
  subject?: string;
  participantPersonIds: string[];
  status: string;
  latestMessageAt?: string;
  updatedAt: string;
  preview?: string;
  externalThreadId?: string;
}) {
  const from =
    PARTICIPANT_DISPLAY_NAMES[thread.participantPersonIds?.[0]] ??
    thread.participantPersonIds?.[0] ??
    thread.channel;
  return {
    id: thread.id,
    channel: thread.channel,
    from,
    subject: thread.subject,
    preview: thread.preview ?? "",
    content: thread.preview ?? "",
    read: thread.status !== "unread",
    timestamp: new Date(thread.latestMessageAt || thread.updatedAt).getTime(),
    threadId: thread.externalThreadId ?? thread.id,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel");
  const unread = searchParams.get("unread");

  if (isE2EEnabled()) {
    let messages = readCollection<InboxMessage>("inbox");
    if (channel && channel !== "all") {
      messages = messages.filter((message) => message.channel === channel);
    }
    if (unread === "true") {
      messages = messages.filter((message) => !message.read);
    }
    messages.sort((a, b) => b.timestamp - a.timestamp);
    return NextResponse.json({ messages });
  }

  const claw = await getWorkspaceClaw();
  let threads = await claw.inbox.list({
    unreadOnly: unread === "true",
    limit: 100,
  });

  if (threads.length === 0) {
    await seedInbox();
    threads = await claw.inbox.list({ limit: 100 });
  }

  if (channel && channel !== "all") {
    threads = threads.filter((t) => t.channel === channel);
  }

  const messages = threads.map(threadToMessage);
  messages.sort((a, b) => b.timestamp - a.timestamp);

  return NextResponse.json({ messages });
}

export async function PUT(request: Request) {
  if (isE2EEnabled()) {
    const body = await request.json();
    const messages = readCollection<InboxMessage>("inbox");
    const index = messages.findIndex((message) => message.id === body.id);
    if (index === -1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    messages[index] = {
      ...messages[index],
      read: body.read === true,
    };
    writeCollection("inbox", messages);
    return NextResponse.json(messages[index]);
  }

  const body = await request.json();
  const claw = await getWorkspaceClaw();

  // Use readThread to fetch and implicitly mark as read
  if (body.read) {
    const result = await claw.inbox.readThread(body.id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(threadToMessage(result.thread));
  }

  // For marking unread or other updates, return current state
  const threads = await claw.inbox.list({ limit: 200 });
  const thread = threads.find((t) => t.id === body.id);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(threadToMessage(thread));
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (isE2EEnabled()) {
    const messages = readCollection<InboxMessage>("inbox");
    writeCollection("inbox", messages.filter((message) => message.id !== id));
    return NextResponse.json({ ok: true });
  }

  const claw = await getWorkspaceClaw();
  await claw.inbox.archive(id);
  return NextResponse.json({ ok: true });
}
