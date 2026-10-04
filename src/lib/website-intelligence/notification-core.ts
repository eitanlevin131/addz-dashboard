export type ScanNotification = {
  status: "pending" | "sending" | "sent" | "disabled" | "skipped" | "failed";
  attempts: number;
  token?: string;
  leaseUntil?: number;
  retryAt?: number;
  sentAt?: string;
  errorCode?: string;
};

export function websiteScanEmailEnabled(env: Record<string, string | undefined>) {
  return env.VERCEL_ENV !== "preview" && env.WEBSITE_SCAN_EMAIL_ENABLED === "true" && Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export function notificationRecipient(user: { email: string; role: string; status: string } | undefined) {
  if (!user || user.status !== "active" || !["owner", "admin", "agency"].includes(user.role)) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ? user.email : null;
}

export function notificationClaimable(notification: ScanNotification | undefined, completedAt: Date | null, now = Date.now()) {
  if (!notification || !completedAt || now - completedAt.getTime() >= 23 * 60 * 60 * 1000) return false;
  if (["sent", "disabled", "skipped"].includes(notification.status) || notification.attempts >= 3) return false;
  return (notification.leaseUntil || 0) <= now && (notification.retryAt || 0) <= now;
}

export function websiteScanLink(origin: string, clientId: string, scanId: string) {
  const url = new URL(origin);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw Error("invalid_notification_origin");
  url.pathname = "/";
  url.search = new URLSearchParams({ view: "client-workspace", clientId, tab: "website", scanId }).toString();
  url.hash = "";
  return url.href;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

export function websiteScanEmail(clientName: string, status: string, link: string) {
  const label = ({ completed: "הושלמה", completed_with_warnings: "הושלמה עם אזהרות", failed: "נכשלה" } as Record<string, string>)[status];
  if (!label) throw Error("non_terminal_notification");
  const summary = status === "failed" ? "לא ניתן היה להשלים את הסריקה. פרטי הכיסוי והתקלה זמינים במערכת." : status === "completed_with_warnings" ? "נשמרו ממצאים; יש מגבלות כיסוי או עיבוד שכדאי לבדוק." : "הממצאים והמקורות זמינים לבדיקה.";
  return {
    subject: `סריקת אתר ${label}: ${clientName.replace(/[\r\n]/g, " ").slice(0, 160)}`,
    text: `סריקת אתר · ${clientName}\nמצב: ${label}\n${summary}\n\nלממצאים ולמקורות: ${link}`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#080123"><h2>סריקת אתר · ${escapeHtml(clientName)}</h2><p><strong>מצב: ${label}</strong></p><p>${summary}</p><a href="${escapeHtml(link)}" style="color:#087f72">פתיחת הממצאים והמקורות</a></div>`,
  };
}
