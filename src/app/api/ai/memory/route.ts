import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assertClientAccess, getAccessContext } from "@/lib/auth/access";
import { aiAccountMemory } from "@/lib/schema";
import { getDb, isDatabaseConfigured } from "@/lib/db";

type MemoryDocument = { name: string; content: string; createdAt: string };

const emptyMemory = {
  brandVoice: "",
  audiences: "",
  products: "",
  learnings: "",
  constraints: "",
  documents: [],
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId") ?? "";

  if (!clientId || !isDatabaseConfigured()) {
    return NextResponse.json({ success: true, data: emptyMemory, persisted: false });
  }

  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext.response;
  const denied = assertClientAccess(accessContext.access, clientId);
  if (denied) return denied;

  try {
    const rows = await getDb()
      .select()
      .from(aiAccountMemory)
      .where(eq(aiAccountMemory.clientId, clientId))
      .limit(1);
    const row = rows[0];

    return NextResponse.json({
      success: true,
      persisted: Boolean(row),
      data: row
        ? {
            brandVoice: row.brandVoice ?? "",
            audiences: row.audiences ?? "",
            products: row.products ?? "",
            learnings: row.learnings ?? "",
            constraints: row.constraints ?? "",
            documents: row.documents ?? [],
          }
        : emptyMemory,
    });
  } catch {
    return NextResponse.json({ success: true, data: emptyMemory, persisted: false });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId ?? "");
  const data = {
    brandVoice: String(body.brandVoice ?? ""),
    audiences: String(body.audiences ?? ""),
    products: String(body.products ?? ""),
    learnings: String(body.learnings ?? ""),
    constraints: String(body.constraints ?? ""),
    documents: Array.isArray(body.documents)
      ? body.documents
          .map((document: { name?: unknown; content?: unknown; createdAt?: unknown }) => ({
            name: String(document.name ?? "מסמך לקוח"),
            content: String(document.content ?? "").slice(0, 20_000),
            createdAt: String(document.createdAt ?? new Date().toISOString()),
          }))
          .filter((document: MemoryDocument) => document.content.trim())
      : [],
  };

  if (!clientId) {
    return NextResponse.json({ success: false, message: "חסר clientId." }, { status: 400 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: true, data, persisted: false });
  }

  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext.response;
  const denied = assertClientAccess(accessContext.access, clientId);
  if (denied) return denied;

  try {
    const [row] = await getDb()
      .insert(aiAccountMemory)
      .values({ clientId, ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: aiAccountMemory.clientId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();

    return NextResponse.json({
      success: true,
      persisted: true,
      data: {
        brandVoice: row.brandVoice ?? "",
        audiences: row.audiences ?? "",
        products: row.products ?? "",
        learnings: row.learnings ?? "",
        constraints: row.constraints ?? "",
        documents: row.documents ?? [],
      },
    });
  } catch {
    return NextResponse.json({ success: true, data, persisted: false });
  }
}
