import { NextResponse } from "next/server";
import { digestClock } from "@/lib/planner-digest";
import { sendPlannerDigest } from "@/lib/planner-digest-delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const clock = digestClock();
  // Two daily UTC triggers cover winter and summer; only the Israeli 08:00 hour sends.
  if (clock.hour !== 8) return NextResponse.json({ success: true, status: "outside_send_hour" });
  return sendPlannerDigest(request, false);
}
