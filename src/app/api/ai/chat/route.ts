import { NextResponse } from "next/server";
import { assertClientAccess, getAccessContext } from "@/lib/auth/access";
import { aiChatMessages } from "@/lib/schema";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  buildAiEvidenceCatalog,
  buildFallbackGroundedResponse,
} from "@/lib/ai-grounding";
import {
  askOpenAiAgent,
  askOpenAiActionPlan,
  askOpenAiOnboarding,
  buildAiContextPack,
  fallbackActionPlan,
  fallbackAgentAnswer,
  fallbackAgentInsights,
  fallbackOnboarding,
  getConfiguredOpenAiModel,
  type AiAccountMemory,
} from "@/lib/ai";
import type {
  AutomationReport,
  EmailCampaignReport,
  FlashyAccount,
  MetricSummary,
  NewsletterPlan,
  SmsCampaignReport,
} from "@/lib/types";

async function trySaveMessage(clientId: string, role: "user" | "assistant", content: string) {
  if (!isDatabaseConfigured()) return;

  try {
    await getDb().insert(aiChatMessages).values({
      clientId,
      userId: null,
      role,
      content,
    });
  } catch {
    // Local/demo ids are not always UUIDs and older DBs may not have this table yet.
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId ?? "");
  const question = String(body.question ?? "").trim();
  const mode =
    body.mode === "recommendations" ? "recommendations" : body.mode === "onboarding" ? "onboarding" : "chat";
  const account = body.account as FlashyAccount | undefined;
  const summary = body.summary as MetricSummary | undefined;
  const currentView = String(body.view ?? "overview");

  if (!clientId || !account || !summary) {
    return NextResponse.json(
      { success: false, message: "חסרים clientId, account או summary לבניית Context Pack." },
      { status: 400 },
    );
  }

  if (isDatabaseConfigured()) {
    const accessContext = await getAccessContext();
    if (!accessContext.ok) return accessContext.response;
    const denied = assertClientAccess(accessContext.access, clientId);
    if (denied) return denied;
  }

  const emails = ((body.emails ?? []) as EmailCampaignReport[])
    .filter((item) => item.accountId === account.id)
    .slice(0, 250);
  const sms = ((body.sms ?? []) as SmsCampaignReport[])
    .filter((item) => item.accountId === account.id)
    .slice(0, 250);
  const automations = ((body.automations ?? []) as AutomationReport[])
    .filter((item) => item.accountId === account.id)
    .slice(0, 250);
  const plans = ((body.plans ?? []) as NewsletterPlan[])
    .filter((item) => item.clientId === clientId && (!item.accountId || item.accountId === account.id))
    .slice(0, 250);
  const memory = (body.memory ?? {}) as AiAccountMemory;
  const context = buildAiContextPack({
    account,
    summary,
    emails,
    sms,
    automations,
    plans,
    memory,
  });
  const evidence = buildAiEvidenceCatalog({
    account,
    summary,
    emails,
    sms,
    automations,
    plans,
    documents: memory.documents,
    question,
    currentView,
  });

  const fallbackAnswer =
    mode === "recommendations"
      ? fallbackActionPlan(context)
          .map((item) => `${item.title}: ${item.action}`)
          .join("\n")
      : mode === "onboarding"
        ? fallbackOnboarding(context).summary
      : fallbackAgentAnswer(question, context);
  let answer = fallbackAnswer;
  let grounding = buildFallbackGroundedResponse(fallbackAnswer, evidence);
  let recommendations = fallbackActionPlan(context);
  let onboarding = fallbackOnboarding(context);
  let provider: "openai" | "rule-based-fallback" = "rule-based-fallback";

  try {
    if (mode === "recommendations") {
      const openAiRecommendations = await askOpenAiActionPlan(context);
      if (openAiRecommendations?.length) {
        recommendations = openAiRecommendations;
        answer = openAiRecommendations.map((item) => `${item.title}: ${item.action}`).join("\n");
        provider = "openai";
      } else throw new Error("OpenAI לא החזיר המלצות.");
    } else if (mode === "onboarding") {
      const openAiOnboarding = await askOpenAiOnboarding(context);
      if (openAiOnboarding) {
        onboarding = openAiOnboarding;
        answer = openAiOnboarding.summary;
        provider = "openai";
      } else throw new Error("OpenAI אינו מוגדר בשרת.");
    } else {
      const openAiAnswer = await askOpenAiAgent({ question, context, evidence, currentView, mode });
      if (openAiAnswer) {
        grounding = openAiAnswer;
        answer = openAiAnswer.answer;
        provider = "openai";
      } else throw new Error("OpenAI אינו מוגדר בשרת.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "קריאת OpenAI נכשלה.";
    return NextResponse.json(
      {
        success: false,
        provider: "openai-error",
        model: getConfiguredOpenAiModel(),
        message,
      },
      { status: 502 },
    );
  }

  if (question) await trySaveMessage(clientId, "user", question);
  await trySaveMessage(clientId, "assistant", answer);

  return NextResponse.json({
    success: true,
    provider,
    providerError: "",
    model: getConfiguredOpenAiModel(),
    recommendations,
    onboarding,
    context,
    insights: fallbackAgentInsights(clientId, context),
    answer,
    grounding,
  });
}
