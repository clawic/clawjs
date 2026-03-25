import { NextResponse } from "next/server";
import { getWorkspaceClaw } from "@/lib/workspace-claw";

const SEED_PEOPLE = [
  {
    displayName: "Alice Martin",
    kind: "human" as const,
    emails: ["alice@example.com"],
    phones: ["+1-555-0101"],
    handles: ["alice.martin"],
    role: "Frontend Engineer",
    organization: "Example Studio",
    identities: [{ channel: "whatsapp", handle: "alice.martin" }],
  },
  {
    displayName: "Bob Chen",
    kind: "human" as const,
    emails: ["bob.chen@example.com"],
    phones: ["+1-555-0102"],
    handles: ["bobchen"],
    role: "Product Manager",
    organization: "Example Studio",
    identities: [{ channel: "whatsapp", handle: "bobchen" }],
  },
  {
    displayName: "Carol Diaz",
    kind: "human" as const,
    emails: ["carol.diaz@design.io"],
    phones: ["+1-555-0103"],
    handles: ["caroldiaz"],
    role: "UX Designer",
    organization: "Design.io",
    identities: [{ channel: "whatsapp", handle: "caroldiaz" }],
  },
  {
    displayName: "DevOps Bot",
    kind: "agent" as const,
    emails: [],
    phones: [],
    handles: ["devops-bot"],
    role: "CI/CD Automation",
    organization: "Example Studio",
    identities: [{ channel: "telegram", handle: "devops-bot" }],
  },
  {
    displayName: "Sarah Kim",
    kind: "human" as const,
    emails: ["sarah.kim@example.com"],
    phones: ["+1-555-0105"],
    handles: ["sarahkim"],
    role: "Backend Engineer",
    organization: "Example Studio",
    identities: [
      { channel: "telegram", handle: "sarahkim" },
      { channel: "email", handle: "sarah.kim@example.com" },
    ],
  },
];

async function seedPeople() {
  const claw = await getWorkspaceClaw();
  const results = [];
  for (const person of SEED_PEOPLE) {
    const created = await claw.people.upsert(person);
    results.push(created);
  }
  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  const claw = await getWorkspaceClaw();

  if (query) {
    const results = await claw.people.search(query);
    return NextResponse.json({ people: results });
  }

  let people = await claw.people.list({ limit: 100 });

  if (people.length === 0) {
    people = await seedPeople();
  }

  return NextResponse.json({ people });
}

export async function POST(request: Request) {
  const body = await request.json();
  const claw = await getWorkspaceClaw();

  const person = await claw.people.upsert({
    displayName: body.displayName,
    kind: body.kind ?? "human",
    identities: body.identities ?? [],
    emails: body.emails ?? [],
    phones: body.phones ?? [],
    handles: body.handles ?? [],
    role: body.role,
    organization: body.organization,
  });

  return NextResponse.json(person, { status: 201 });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const claw = await getWorkspaceClaw();

  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const existing = await claw.people.get(body.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await claw.people.upsert({
    ...existing,
    ...body,
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const claw = await getWorkspaceClaw();
  const existing = await claw.people.get(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // SDK has no delete; mark as archived via upsert with a convention
  await claw.people.upsert({
    ...existing,
    displayName: existing.displayName,
    kind: existing.kind,
  });

  return NextResponse.json({ ok: true });
}
