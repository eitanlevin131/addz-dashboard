import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import { ClientInputError } from "@/lib/client-foundation";
import { isDatabaseConfigured } from "@/lib/db";

export async function clientApi(
  work: (actorId: string) => Promise<unknown>,
  status = 200,
) {
  const context = await requireAdmin();
  if (!context.ok) return context.response;
  if (!isDatabaseConfigured())
    return NextResponse.json(
      { success: false, message: "מסד הנתונים אינו מוגדר." },
      { status: 503 },
    );
  try {
    return NextResponse.json(
      { success: true, data: await work(context.access.userId) },
      { status },
    );
  } catch (error) {
    if (error instanceof ClientInputError)
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status },
      );
    const cause =
      error && typeof error === "object" && "cause" in error
        ? error.cause
        : error;
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? cause.code
        : undefined;
    if (code === "23505")
      return NextResponse.json(
        { success: false, message: "המידע עודכן במקביל. יש לרענן ולנסות שוב." },
        { status: 409 },
      );
    console.error("Client foundation request failed", { code });
    return NextResponse.json(
      {
        success: false,
        message:
          "לא ניתן להשלים את הפעולה כרגע. ודא שמיגרציית הלקוחות הוחלה ונסה שוב.",
      },
      { status: 503 },
    );
  }
}
export async function clientBody(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new ClientInputError("פרטי הבקשה אינם תקינים.");
  }
}
