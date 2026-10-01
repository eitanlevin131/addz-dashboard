import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/access";
import { sendPlannerDigest } from "@/lib/planner-digest-delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const context = await requireOwner();
  if (!context.ok) return context.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }
  return sendPlannerDigest(request, true);
}
