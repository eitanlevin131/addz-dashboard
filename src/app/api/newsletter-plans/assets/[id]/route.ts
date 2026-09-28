import { del, get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertClientAccess, getAccessContext } from "@/lib/auth/access";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { newsletterPlanAssets, newsletterPlans } from "@/lib/schema";

async function authorizedAsset(id: string) {
  if (!isDatabaseConfigured()) return { response: NextResponse.json({ success: false, message: "Neon עדיין לא מחובר." }, { status: 409 }) };
  const context = await getAccessContext();
  if (!context.ok) return { response: context.response };
  const db = getDb();
  const asset = await db.select({ asset: newsletterPlanAssets, clientId: newsletterPlans.clientId })
    .from(newsletterPlanAssets)
    .innerJoin(newsletterPlans, eq(newsletterPlanAssets.newsletterPlanId, newsletterPlans.id))
    .where(eq(newsletterPlanAssets.id, id)).limit(1).then((rows) => rows[0]);
  if (!asset?.clientId) return { response: NextResponse.json({ success: false, message: "הנכס לא נמצא." }, { status: 404 }) };
  const denied = assertClientAccess(context.access, asset.clientId);
  if (denied) return { response: denied };
  return { asset: asset.asset, db };
}

export async function GET(request: Request, context: RouteContext<"/api/newsletter-plans/assets/[id]">) {
  const { id } = await context.params;
  const authorized = await authorizedAsset(id);
  if ("response" in authorized) return authorized.response;
  if (authorized.asset.kind === "link" && authorized.asset.url) {
    return NextResponse.redirect(authorized.asset.url);
  }
  if (!authorized.asset.blobPathname) {
    return NextResponse.json({ success: false, message: "הקובץ אינו זמין." }, { status: 404 });
  }
  const result = await get(authorized.asset.blobPathname, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
  });
  if (!result) return new NextResponse("Not found", { status: 404 });
  if (result.statusCode === 304) {
    return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" } });
  }
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || authorized.asset.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(authorized.asset.fileName ?? "attachment")}`,
      "X-Content-Type-Options": "nosniff",
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache",
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/newsletter-plans/assets/[id]">) {
  const { id } = await context.params;
  const authorized = await authorizedAsset(id);
  if ("response" in authorized) return authorized.response;
  if (authorized.asset.blobPathname) await del(authorized.asset.blobPathname);
  await authorized.db.delete(newsletterPlanAssets).where(eq(newsletterPlanAssets.id, id));
  return NextResponse.json({ success: true, data: { id } });
}
