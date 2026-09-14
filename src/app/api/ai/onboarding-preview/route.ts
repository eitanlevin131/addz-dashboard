import { NextResponse } from "next/server";
import { askOpenAiOnboardingDocuments, getConfiguredOpenAiModel } from "@/lib/ai";
import { requireOwner } from "@/lib/auth/access";

type DocumentInput = { name: string; content: string; createdAt: string };

export async function POST(request: Request) {
  const context = await requireOwner();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({}));
  const documents = Array.isArray(body.documents)
    ? (body.documents as DocumentInput[]).filter((document) => document?.name && document?.content).slice(0, 8)
    : [];
  if (!documents.length) {
    return NextResponse.json({ success: false, message: "צריך להעלות לפחות מסמך אחד לסריקה." }, { status: 400 });
  }
  if (documents.reduce((sum, document) => sum + document.content.length, 0) > 320_000) {
    return NextResponse.json({ success: false, message: "המסמכים ארוכים מדי לסריקה אחת." }, { status: 413 });
  }

  try {
    const onboarding = await askOpenAiOnboardingDocuments(documents);
    if (!onboarding) {
      return NextResponse.json({ success: false, message: "OpenAI אינו מוגדר בשרת." }, { status: 503 });
    }
    return NextResponse.json({ success: true, provider: "openai", model: getConfiguredOpenAiModel(), onboarding });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        provider: "openai-error",
        model: getConfiguredOpenAiModel(),
        message: error instanceof Error ? error.message : "סריקת המסמכים באמצעות OpenAI נכשלה.",
      },
      { status: 502 },
    );
  }
}
