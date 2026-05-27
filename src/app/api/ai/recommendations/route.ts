import { NextResponse } from "next/server";
import {
  automationReports,
  emailReports,
  flashyAccounts,
  smsReports,
} from "@/lib/demo-data";
import { answerFromData, ruleBasedInsights } from "@/lib/ai";
import { summarizeAccount } from "@/lib/metrics";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId ?? "");
  const question = String(body.question ?? "");
  const account = flashyAccounts.find((item) => item.clientId === clientId);

  if (!account) {
    return NextResponse.json(
      { success: false, message: "לקוח לא נמצא או אין לו חשבון Flashy" },
      { status: 404 },
    );
  }

  const summary = summarizeAccount(
    account,
    emailReports.filter((item) => item.accountId === account.id),
    smsReports.filter((item) => item.accountId === account.id),
    automationReports.filter((item) => item.accountId === account.id),
  );

  return NextResponse.json({
    success: true,
    provider: process.env.OPENAI_API_KEY ? "openai-ready" : "rule-based-fallback",
    insights: ruleBasedInsights(clientId, summary),
    answer: answerFromData(question, summary),
  });
}
