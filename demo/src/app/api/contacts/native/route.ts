import { NextRequest, NextResponse } from "next/server";
import { listNativeContacts } from "@/lib/contacts-native";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 500;

  try {
    const contacts = await listNativeContacts({ limit });
    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ contacts: [] });
  }
}
