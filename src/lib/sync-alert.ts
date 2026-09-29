export type SyncAlertAccount = {
  accountName: string;
  status: "failed" | "warning";
  message: string;
  warnings: string[];
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export function buildSyncAlertEmail(accounts: SyncAlertAccount[], dashboardUrl: string) {
  const failures = accounts.filter((account) => account.status === "failed").length;
  const warnings = accounts.length - failures;
  const summary = [
    failures ? `${failures} חשבונות נכשלו` : null,
    warnings ? `${warnings} חשבונות דורשים בדיקה` : null,
  ].filter(Boolean).join(" · ");
  const textRows = accounts.map((account) => {
    const details = account.warnings.length ? `\n${account.warnings.map((warning) => `- ${warning}`).join("\n")}` : "";
    return `${account.status === "failed" ? "נכשל" : "אזהרה"}: ${account.accountName}\n${account.message}${details}`;
  });
  const htmlRows = accounts.map((account) => `<div style="padding:14px 0;border-bottom:1px solid #e4e7ec"><strong>${escapeHtml(account.accountName)}</strong><span style="display:inline-block;margin-right:8px;padding:3px 7px;background:${account.status === "failed" ? "#fee4e2" : "#fff4e8"};color:${account.status === "failed" ? "#b42318" : "#b45309"};font-size:12px">${account.status === "failed" ? "נכשל" : "דורש בדיקה"}</span><div style="margin-top:6px;color:#475467">${escapeHtml(account.message)}</div>${account.warnings.length ? `<ul style="margin:8px 0 0;padding-right:18px;color:#667085">${account.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}</div>`).join("");

  return {
    subject: `התראת סנכרון addz Growth OS: ${summary}`,
    text: [`התראת סנכרון יומית`, summary, "", ...textRows, "", `לבדיקה: ${dashboardUrl}`].join("\n"),
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#080123"><div style="background:#080123;color:#fff;padding:20px 24px"><strong style="font-size:22px">addz <span style="color:#FFE045">Growth OS</span></strong><div style="margin-top:6px;color:#d0cddd">התראת סנכרון יומית</div></div><div style="border:1px solid #e4e7ec;border-top:0;padding:24px"><h2 style="margin:0 0 8px;font-size:20px">${escapeHtml(summary)}</h2><p style="margin:0 0 16px;color:#667085">נשלחה התראה רק עבור חשבונות שנכשלו או הציגו חריגת נתונים.</p>${htmlRows}<a href="${escapeHtml(dashboardUrl)}" style="display:block;margin-top:22px;padding:12px 18px;background:#FFE045;color:#080123;text-decoration:none;text-align:center;font-weight:700">פתחו את המערכת לבדיקה</a></div></div>`,
  };
}

function alertRecipients() {
  return (process.env.SYNC_ALERT_EMAILS || process.env.OWNER_EMAIL || "")
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    .slice(0, 10);
}

export async function sendSyncAlertEmail(accounts: SyncAlertAccount[], dashboardUrl: string) {
  if (!accounts.length) return { status: "not_needed" as const, recipients: 0 };
  const recipients = alertRecipients();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!recipients.length || !apiKey || !from) {
    return { status: "not_configured" as const, recipients: recipients.length };
  }

  const content = buildSyncAlertEmail(accounts, dashboardUrl);
  try {
    const baseUrl = process.env.RESEND_API_BASE_URL?.trim() || "https://api.resend.com";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: recipients, ...content }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (!response.ok || !payload?.id) {
      return { status: "failed" as const, recipients: recipients.length, error: payload?.message || `Resend returned ${response.status}` };
    }
    return { status: "sent" as const, recipients: recipients.length, providerMessageId: payload.id };
  } catch (error) {
    return { status: "failed" as const, recipients: recipients.length, error: error instanceof Error ? error.message : "Sync alert delivery failed" };
  }
}
