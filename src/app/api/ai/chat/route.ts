import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { assertClientAccess, getAccessContext } from "@/lib/auth/access";
import { accountChangeEvents, aiChatMessages, flashyAccounts } from "@/lib/schema";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  buildAiEvidenceCatalog,
  buildCampaignListGroundedResponse,
  buildFallbackGroundedResponse,
  buildTimingGroundedResponse,
  isCampaignListQuestion,
} from "@/lib/ai-grounding";
import { loadHistoricalAiData } from "@/lib/ai-historical-data";
import { resolveAiQuestionPeriod } from "@/lib/ai-question-period";
import { summarizeAccount } from "@/lib/metrics";
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
  AccountChangeEvent,
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
  const requestSummary = body.summary as MetricSummary | undefined;
  const currentView = String(body.view ?? "overview");

  if (!clientId || !account || !requestSummary) {
    return NextResponse.json(
      { success: false, message: "חסרים clientId, account או summary לבניית Context Pack." },
      { status: 400 },
    );
  }

  let accessUserId: string | null = null;
  let storedAccount: typeof flashyAccounts.$inferSelect | null = null;
  if (isDatabaseConfigured()) {
    const accessContext = await getAccessContext();
    if (!accessContext.ok) return accessContext.response;
    const denied = assertClientAccess(accessContext.access, clientId);
    if (denied) return denied;
    accessUserId = accessContext.access.userId;
    storedAccount = await getDb()
      .select()
      .from(flashyAccounts)
      .where(and(eq(flashyAccounts.id, account.id), eq(flashyAccounts.clientId, clientId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (!storedAccount) {
      return NextResponse.json({ success: false, message: "החשבון לא נמצא עבור הלקוח שנבחר." }, { status: 404 });
    }
  }

  let emails = ((body.emails ?? []) as EmailCampaignReport[])
    .filter((item) => item.accountId === account.id)
    .slice(0, 250);
  let sms = ((body.sms ?? []) as SmsCampaignReport[])
    .filter((item) => item.accountId === account.id)
    .slice(0, 250);
  let automations = ((body.automations ?? []) as AutomationReport[])
    .filter((item) => item.accountId === account.id)
    .slice(0, 250);
  const plans = ((body.plans ?? []) as NewsletterPlan[])
    .filter((item) => item.clientId === clientId && (!item.accountId || item.accountId === account.id))
    .slice(0, 250);
  const memory = (body.memory ?? {}) as AiAccountMemory;
  const questionPeriod = mode === "chat"
    ? resolveAiQuestionPeriod(question, storedAccount?.timezone ?? account.timezone)
    : null;
  const campaignListRequested = mode === "chat" && isCampaignListQuestion(question);
  const historicalData = questionPeriod && storedAccount
    ? await loadHistoricalAiData({
        accountId: storedAccount.id,
        encryptedApiKey: storedAccount.encryptedApiKey,
        timezone: storedAccount.timezone,
        period: questionPeriod,
        includeAutomations: !campaignListRequested,
      })
    : null;
  if (historicalData) {
    emails = historicalData.emails;
    sms = historicalData.sms;
    automations = historicalData.automations;
  }
  const summary = historicalData
    ? summarizeAccount(account, emails, sms, automations, false)
    : requestSummary;
  const accountChanges: AccountChangeEvent[] = isDatabaseConfigured()
    ? await getDb()
        .select()
        .from(accountChangeEvents)
        .where(and(
          eq(accountChangeEvents.clientId, clientId),
          eq(accountChangeEvents.flashyAccountId, account.id),
        ))
        .orderBy(desc(accountChangeEvents.occurredAt))
        .limit(100)
        .then((rows) => rows.map((event) => ({
          id: event.id,
          clientId: event.clientId,
          accountId: event.flashyAccountId,
          title: event.title,
          details: event.details,
          reason: event.reason ?? "",
          areas: event.areas as AccountChangeEvent["areas"],
          occurredAt: event.occurredAt.toISOString(),
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
          createdBy: { id: event.createdByUserId, name: "צוות addz", email: "" },
        })))
    : [];
  const context = buildAiContextPack({
    account,
    summary,
    emails,
    sms,
    automations,
    plans,
    accountChanges,
    dataScope: historicalData?.scope,
    memory,
  });
  const evidence = buildAiEvidenceCatalog({
    account,
    summary,
    emails,
    sms,
    automations,
    plans,
    accountChanges,
    dataScope: historicalData?.scope,
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
    accountChanges,
    dataScope: historicalData?.scope,
    documents: memory.documents,
    question,
    currentView,
  }) : null;
  const campaignListGrounding = mode === "chat" ? buildCampaignListGroundedResponse({
    account,
    summary,
    emails,
    sms,
    automations,
    plans,
    accountChanges,
    dataScope: historicalData?.scope,
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
  let provider: "openai" | "rule-based-fallback" | "deterministic-analysis" = timingGrounding || campaignListGrounding
    ? "deterministic-analysis"
    : "rule-based-fallback";

  const deterministicGrounding = campaignListGrounding ?? timingGrounding;
  if (deterministicGrounding) {
    grounding = deterministicGrounding;
    answer = deterministicGrounding.answer;
  }

  try {
    if (deterministicGrounding) {
      // Historical lists and timing recommendations are calculated directly from measured report rows.
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
    analysisMode: campaignListGrounding ? "deterministic-history" : timingGrounding ? "deterministic-timing" : "model",
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
