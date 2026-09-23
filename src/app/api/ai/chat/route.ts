import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { assertClientAccess, getAccessContext } from "@/lib/auth/access";
import { aiChatMessages } from "@/lib/schema";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  buildAiEvidenceCatalog,
  buildFallbackGroundedResponse,
  buildTimingGroundedResponse,
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

async function readRecentMessages(clientId: string, limit = 60) {
  if (!isDatabaseConfigured()) return [];

  try {
    const rows = await getDb()
      .select({
        id: aiChatMessages.id,
        role: aiChatMessages.role,
        content: aiChatMessages.content,
        createdAt: aiChatMessages.createdAt,
      })
      .from(aiChatMessages)
      .where(eq(aiChatMessages.clientId, clientId))
      .orderBy(desc(aiChatMessages.createdAt))
      .limit(limit);
    const messages = rows.reverse().filter((row) => row.role === "user" || row.role === "assistant");
    const conversation: typeof messages = [];
    let waitingForAssistant = false;
    for (const message of messages) {
      if (message.role === "user") {
        conversation.push(message);
        waitingForAssistant = true;
      } else if (waitingForAssistant) {
        conversation.push(message);
        waitingForAssistant = false;
      }
    }
    return conversation;
  } catch {
    return [];
  }
}

async function trySaveExchange(clientId: string, userId: string | null, question: string, answer: string) {
  if (!isDatabaseConfigured()) return false;

  try {
    const userCreatedAt = new Date();
    const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);
    await getDb().insert(aiChatMessages).values([
      { clientId, userId, role: "user", content: question, createdAt: userCreatedAt },
      { clientId, userId, role: "assistant", content: answer, createdAt: assistantCreatedAt },
    ]);
    return true;
  } catch {
    // Local/demo ids are not always UUIDs and older DBs may not have this table yet.
    return false;
  }
}

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim() ?? "";
  if (!clientId) {
    return NextResponse.json({ success: false, message: "חסר clientId לטעינת היסטוריית השיחה." }, { status: 400 });
  }
  if (!isDatabaseConfigured()) return NextResponse.json({ success: true, messages: [] });

  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext.response;
  const denied = assertClientAccess(accessContext.access, clientId);
  if (denied) return denied;

  const messages = await readRecentMessages(clientId, 80);
  return NextResponse.json({
    success: true,
    messages: messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
  });
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

  let accessUserId: string | null = null;
  if (isDatabaseConfigured()) {
    const accessContext = await getAccessContext();
    if (!accessContext.ok) return accessContext.response;
    const denied = assertClientAccess(accessContext.access, clientId);
    if (denied) return denied;
    accessUserId = accessContext.access.userId;
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
  const conversation = mode === "chat"
    ? (await readRecentMessages(clientId, 12)).map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content.slice(0, 2_000),
      }))
    : [];
  const timingGrounding = mode === "chat" ? buildTimingGroundedResponse({
    account,
    summary,
    emails,
    sms,
    automations,
    plans,
    documents: memory.documents,
    question,
    currentView,
  }) : null;

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
  let provider: "openai" | "rule-based-fallback" | "deterministic-analysis" = timingGrounding ? "deterministic-analysis" : "rule-based-fallback";

  if (timingGrounding) {
    grounding = timingGrounding;
    answer = timingGrounding.answer;
  }

  try {
    if (timingGrounding) {
      // Timing recommendations are calculated from the same dataset and formula as the campaign report.
    } else if (mode === "recommendations") {
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
      const openAiAnswer = await askOpenAiAgent({ question, context, evidence, conversation, currentView, mode });
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

  const historyPersisted = mode === "chat" && question
    ? await trySaveExchange(clientId, accessUserId, question, answer)
    : false;

  return NextResponse.json({
    success: true,
    provider,
    analysisMode: timingGrounding ? "deterministic-timing" : "model",
    historyPersisted,
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
