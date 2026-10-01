export type DigestPlan = {
  id: string;
  clientId: string;
  clientName: string;
  date: string | null;
  time: string | null;
  title: string;
  channel: string;
  status: string;
  sent: boolean;
};

export function digestClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function plannerDigestGroups(plans: DigestPlan[], today: string) {
  const day = (offset: number) => {
    const value = new Date(`${today}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const pending = plans.filter((plan) => !plan.sent && plan.status !== "sent" && plan.status !== "idea");
  const upcoming = pending.filter((plan) => plan.date && plan.date >= day(2) && plan.date <= day(7));
  const sort = (rows: DigestPlan[]) => rows.sort((a, b) => a.clientName.localeCompare(b.clientName, "he") || (a.date ?? "").localeCompare(b.date ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));
  return [
    { title: "להכנה עכשיו · בעוד יומיים–שלושה", rows: sort(upcoming.filter((p) => p.status !== "ready" && p.date! <= day(3))) },
    { title: "להמשך תכנון · בעוד ארבעה–שבעה ימים", rows: sort(upcoming.filter((p) => p.status !== "ready" && p.date! >= day(4))) },
    { title: "מוכנים לשליחה", rows: sort(upcoming.filter((p) => p.status === "ready")) },
    { title: "בריפים ללא תאריך", rows: sort(pending.filter((p) => !p.date)) },
  ];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!);
}

export function buildPlannerDigest(plans: DigestPlan[], today: string, origin: string) {
  const groups = plannerDigestGroups(plans, today);
  const url = (plan: DigestPlan) => `${origin}/?view=planner&clientId=${encodeURIComponent(plan.clientId)}&planId=${encodeURIComponent(plan.id)}`;
  const channel = (plan: DigestPlan) => ({ email: "אימייל", sms: "SMS", mixed: "מייל + SMS" })[plan.channel] ?? plan.channel;
  const date = (plan: DigestPlan) => plan.date ? `${plan.date.split("-").reverse().join(".")} · ${plan.time || "שעה לא נקבעה"}` : "טרם נקבע תאריך";
  const text = groups.map((group) => `${group.title}\n${group.rows.map((p) => `${p.clientName} · ${p.title}\n${date(p)} · ${channel(p)}${p.status === "postponed" ? " · נדחה" : ""}\n${url(p)}`).join("\n\n") || "אין דיוורים בקבוצה זו."}`).join("\n\n");
  const html = groups.map((group) => `<h2 style="font-size:18px;margin:28px 0 12px">${escapeHtml(group.title)}</h2>${group.rows.map((p) => `<div style="padding:12px 0;border-bottom:1px solid #e4e7ec"><strong>${escapeHtml(p.clientName)}</strong><div style="margin-top:6px">${escapeHtml(p.title)}</div><div style="margin-top:6px;color:#667085">${escapeHtml(date(p))} · ${escapeHtml(channel(p))}${p.status === "postponed" ? " · נדחה" : ""}</div><a href="${escapeHtml(url(p))}" style="display:inline-block;margin-top:8px;color:#087f72">פתח בריף בגאנט</a></div>`).join("") || "<p style=\"color:#667085\">אין דיוורים בקבוצה זו.</p>"}`).join("");
  return {
    subject: `תכנון דיוורים · addz Growth OS · ${today}`,
    text,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#080123;padding:24px"><h1 style="font-size:24px">תכנון העבודה לשבוע הקרוב</h1><p>דיוורים בעוד יומיים עד שבעה ימים · ${today}</p>${html}</div>`,
    count: groups.reduce((total, g) => total + g.rows.length, 0),
  };
}
