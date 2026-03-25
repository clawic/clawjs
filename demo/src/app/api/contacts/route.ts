import { NextRequest, NextResponse } from "next/server";

import { isE2EEnabled, listE2EContacts } from "@/lib/e2e";
import {
  generateId,
  readCollection,
  writeCollection,
} from "@/lib/demo-store";
import type { Contact } from "@/lib/types";

/* ── Extended contact stored in demo-store ── */
export interface StoredContact extends Contact {
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  avatarEmoji?: string;
  createdAt: number;
  updatedAt: number;
}

const COLLECTION = "contacts";

function readContacts(): StoredContact[] {
  return readCollection<StoredContact>(COLLECTION);
}

function writeContacts(data: StoredContact[]): void {
  writeCollection(COLLECTION, data);
}

export async function GET() {
  if (isE2EEnabled()) {
    // Map E2E contacts to StoredContact shape
    const e2e = listE2EContacts();
    const contacts: StoredContact[] = e2e.map((c) => ({
      id: c.id,
      label: c.name,
      messages_sent: 0,
      messages_received: 0,
      tone_score: 0.5,
      tone_trend: 0,
      topics: [],
      response_latency_avg_seconds: 0,
      baseline_deviation: 0,
      role: c.relationship,
      avatarEmoji: c.emoji,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    return NextResponse.json({ contacts });
  }

  return NextResponse.json({ contacts: readContacts() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const now = Date.now();
  const contact: StoredContact = {
    id: generateId(),
    label: body.label?.trim() || "Unnamed",
    messages_sent: body.messages_sent ?? 0,
    messages_received: body.messages_received ?? 0,
    tone_score: body.tone_score ?? 0.5,
    tone_trend: body.tone_trend ?? 0,
    topics: body.topics ?? [],
    response_latency_avg_seconds: body.response_latency_avg_seconds ?? 0,
    baseline_deviation: body.baseline_deviation ?? 0,
    tier: body.tier ?? 3,
    role: body.role?.trim() || undefined,
    email: body.email?.trim() || undefined,
    phone: body.phone?.trim() || undefined,
    company: body.company?.trim() || undefined,
    notes: body.notes?.trim() || undefined,
    avatarEmoji: body.avatarEmoji?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const all = readContacts();
  all.push(contact);
  writeContacts(all);

  return NextResponse.json(contact, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const all = readContacts();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = all[idx];
  all[idx] = {
    ...existing,
    label: body.label?.trim() ?? existing.label,
    tier: body.tier ?? existing.tier,
    role: body.role?.trim() ?? existing.role,
    email: body.email?.trim() ?? existing.email,
    phone: body.phone?.trim() ?? existing.phone,
    company: body.company?.trim() ?? existing.company,
    notes: body.notes?.trim() ?? existing.notes,
    topics: body.topics ?? existing.topics,
    avatarEmoji: body.avatarEmoji?.trim() ?? existing.avatarEmoji,
    tone_score: body.tone_score ?? existing.tone_score,
    messages_sent: body.messages_sent ?? existing.messages_sent,
    messages_received: body.messages_received ?? existing.messages_received,
    response_latency_avg_seconds: body.response_latency_avg_seconds ?? existing.response_latency_avg_seconds,
    updatedAt: Date.now(),
  };
  writeContacts(all);

  return NextResponse.json(all[idx]);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const all = readContacts();
  const filtered = all.filter((c) => c.id !== id);
  if (filtered.length === all.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  writeContacts(filtered);

  return NextResponse.json({ ok: true });
}
