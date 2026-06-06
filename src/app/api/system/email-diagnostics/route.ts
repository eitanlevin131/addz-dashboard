import { NextResponse } from "next/server";

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getEmailDomain(from: string) {
  const match = from.match(/<[^@<>]+@([^<>]+)>$/) ?? from.match(/@([^\s>]+)$/);
  return match?.[1]?.trim().toLowerCase() ?? "";
}

export async function POST(request: Request) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: string };
  const identifier = email?.trim().toLowerCase();
  const adminEmails = getAdminEmails();
  const resendApiKey = process.env.RESEND_API_KEY || process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.EMAIL_FROM ?? "";

  if (!identifier || !adminEmails.has(identifier)) {
    return NextResponse.json(
      {
        success: false,
        message: "אפשר להריץ בדיקת מייל רק למייל שמופיע ב-ADMIN_EMAILS.",
      },
      { status: 403 },
    );
  }

  if (!resendApiKey) {
    return NextResponse.json(
      {
        success: false,
        message: "RESEND_API_KEY לא מוגדר ב-Vercel Production.",
      },
      { status: 400 },
    );
  }

  if (!from) {
    return NextResponse.json(
      {
        success: false,
        message: "EMAIL_FROM לא מוגדר ב-Vercel Production.",
      },
      { status: 400 },
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: identifier,
      subject: "בדיקת חיבור Resend - Flashy Growth Desk",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6">
          <h2>בדיקת Resend הצליחה</h2>
          <p>אם קיבלת את המייל הזה, Resend מחובר לדאשבורד.</p>
        </div>
      `,
      text: "בדיקת Resend הצליחה. Resend מחובר לדאשבורד.",
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      {
        success: false,
        message: "Resend דחה את השליחה.",
        resendStatus: response.status,
        resendResponse: body,
        from,
        fromDomain: getEmailDomain(from),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "בדיקת Resend נשלחה בהצלחה.",
    from,
    fromDomain: getEmailDomain(from),
  });
}
