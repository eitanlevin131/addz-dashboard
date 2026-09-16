import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { requestIp, requestLoginCode } from "@/lib/auth/email-code";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "שירות ההתחברות אינו זמין כרגע." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await requestLoginCode({
    email: String(body.email ?? ""),
    ip: requestIp(request),
  });

  if (!result.accepted) {
    return NextResponse.json({ success: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: result.message }, { status: 202 });
}
