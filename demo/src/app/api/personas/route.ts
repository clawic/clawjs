import { NextResponse } from "next/server";
import { readCollection, writeCollection, generateId, type Persona } from "@/lib/demo-store";

const DEFAULT_PERSONAS: Omit<Persona, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Assistant",
    avatar: "\ud83e\udd16",
    role: "General Purpose",
    systemPrompt: "You are a helpful general-purpose assistant.",
    skills: ["conversation", "analysis", "summarization"],
    channels: ["Chat"],
    isDefault: true,
  },
  {
    name: "Researcher",
    avatar: "\ud83d\udd2c",
    role: "Research Focused",
    systemPrompt: "You are a research-focused assistant. Prioritize accuracy, cite sources, and provide thorough analysis.",
    skills: ["research", "analysis", "fact-checking", "citation"],
    channels: ["Chat", "Email"],
    isDefault: false,
  },
  {
    name: "Writer",
    avatar: "\u270d\ufe0f",
    role: "Content Creation",
    systemPrompt: "You are a creative writing assistant. Help with drafting, editing, and polishing written content.",
    skills: ["drafting", "editing", "copywriting", "storytelling"],
    channels: ["Chat", "Email"],
    isDefault: false,
  },
];

function seedIfEmpty(): Persona[] {
  let personas = readCollection<Persona>("personas");
  if (personas.length === 0) {
    const now = Date.now();
    personas = DEFAULT_PERSONAS.map((p) => ({
      ...p,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }));
    writeCollection("personas", personas);
  }
  return personas;
}

export async function GET() {
  const personas = seedIfEmpty();
  return NextResponse.json({ personas });
}

export async function POST(request: Request) {
  const body = await request.json();
  const personas = seedIfEmpty();
  const persona: Persona = {
    id: generateId(),
    name: body.name || "New Persona",
    avatar: body.avatar || "\ud83d\ude42",
    role: body.role || "",
    systemPrompt: body.systemPrompt || "",
    skills: body.skills || [],
    channels: body.channels || [],
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  personas.push(persona);
  writeCollection("personas", personas);
  return NextResponse.json(persona);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const personas = seedIfEmpty();
  const idx = personas.findIndex((p) => p.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If setting this persona as default, unset others
  if (body.isDefault && !personas[idx].isDefault) {
    personas.forEach((p, i) => {
      if (p.isDefault) personas[i] = { ...p, isDefault: false, updatedAt: Date.now() };
    });
  }

  personas[idx] = { ...personas[idx], ...body, updatedAt: Date.now() };
  writeCollection("personas", personas);
  return NextResponse.json(personas[idx]);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const personas = seedIfEmpty();
  const target = personas.find((p) => p.id === id);
  if (target?.isDefault) {
    return NextResponse.json({ error: "Cannot delete the default persona" }, { status: 400 });
  }
  writeCollection("personas", personas.filter((p) => p.id !== id));
  return NextResponse.json({ ok: true });
}
