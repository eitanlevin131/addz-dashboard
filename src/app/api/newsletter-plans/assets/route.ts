import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertClientAccess, getAccessContext } from "@/lib/auth/access";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { mapNewsletterPlanAsset } from "@/lib/newsletter-plan";
import { newsletterPlanAssets, newsletterPlans } from "@/lib/schema";

const MAX_FILE_SIZE = 4_000_000;
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function safeFileName(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-");
  return cleaned.slice(-120) || "attachment";
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "Neon עדיין לא מחובר." }, { status: 409 });
  }
  const form = await request.formData().catch(() => null);
  const planId = String(form?.get("planId") ?? "").trim();
  const kind = String(form?.get("kind") ?? "").trim();
  if (!planId || !["link", "file"].includes(kind)) {
    return NextResponse.json({ success: false, message: "חסרים פריט תכנון או סוג נכס." }, { status: 400 });
  }

  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext.response;
  const db = getDb();
  const plan = await db.select({ id: newsletterPlans.id, clientId: newsletterPlans.clientId })
    .from(newsletterPlans).where(eq(newsletterPlans.id, planId)).limit(1).then((rows) => rows[0]);
  if (!plan?.clientId) {
    return NextResponse.json({ success: false, message: "פריט התכנון לא נמצא." }, { status: 404 });
  }
  const denied = assertClientAccess(accessContext.access, plan.clientId);
  if (denied) return denied;

  if (kind === "link") {
    const rawUrl = String(form?.get("url") ?? "").trim();
    const label = String(form?.get("label") ?? "").trim().slice(0, 160);
    let url: URL;
    try {
      url = new URL(rawUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol");
    } catch {
      return NextResponse.json({ success: false, message: "יש להזין קישור מלא ותקין." }, { status: 400 });
    }
    const [asset] = await db.insert(newsletterPlanAssets).values({
      newsletterPlanId: planId,
      kind: "link",
      label: label || url.hostname,
      url: url.toString(),
    }).returning();
    return NextResponse.json({ success: true, data: mapNewsletterPlanAsset(asset) }, { status: 201 });
  }

  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, message: "לא נבחר קובץ להעלאה." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, message: "גודל הקובץ מוגבל ל־4MB." }, { status: 413 });
  }
  if (!allowedMimeTypes.has(file.type)) {
    return NextResponse.json({ success: false, message: "סוג הקובץ אינו נתמך. אפשר להעלות PDF, Word, Excel, טקסט או תמונה." }, { status: 415 });
  }

  let blob: Awaited<ReturnType<typeof put>> | null = null;
  try {
    blob = await put(`planner/${plan.clientId}/${planId}/${safeFileName(file.name)}`, file, {
      access: "private",
      addRandomSuffix: true,
    });
    const [asset] = await db.insert(newsletterPlanAssets).values({
      newsletterPlanId: planId,
      kind: "file",
      label: String(form?.get("label") ?? "").trim().slice(0, 160) || file.name,
      blobPathname: blob.pathname,
      fileName: file.name.slice(0, 255),
      mimeType: file.type,
      size: file.size,
    }).returning();
    return NextResponse.json({ success: true, data: mapNewsletterPlanAsset(asset) }, { status: 201 });
  } catch (error) {
    if (blob?.pathname) await del(blob.pathname).catch(() => undefined);
    return NextResponse.json({
      success: false,
      message: error instanceof Error && /token|store|blob/i.test(error.message)
        ? "אחסון הקבצים עדיין לא מחובר. יש ליצור Private Blob Store בפרויקט Vercel."
        : "העלאת הקובץ נכשלה.",
    }, { status: 500 });
  }
}
