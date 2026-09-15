import { createServer } from "node:http";

const port = Number(process.env.E2E_MOCK_PORT || 3061);

function dateOffset(days) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timestamp(date, hour = 10) {
  return Math.floor(Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`) / 1000);
}

function inRequestedWindow(date, url) {
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  const value = timestamp(date);
  return (!Number.isFinite(from) || value >= from) && (!Number.isFinite(to) || value <= to);
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const value = Buffer.concat(chunks).toString("utf8");
  return value ? JSON.parse(value) : {};
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") return json(response, 200, { ok: true });

  if (url.pathname === "/v1/responses" && request.method === "POST") {
    await requestBody(request);
    const answer = {
      answer: "בדיקת E2E הושלמה: הנתונים, החישוב והמקור זמינים.",
      facts: [{ text: "הסיכום מבוסס על מדדי הטווח הנבחר.", evidenceIds: ["summary:current-range"] }],
      calculations: [{ text: "החזר ההשקעה חושב מתוך ההכנסה והעלות.", formula: "הכנסה / עלות", evidenceIds: ["summary:current-range"] }],
      inferences: [{ text: "אפשר להמשיך לניתוח הדוחות המפורטים.", confidence: "high", evidenceIds: ["summary:current-range"] }],
    };
    return json(response, 200, {
      output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }],
    });
  }

  const apiKey = String(request.headers["x-api-key"] || "");
  if (!apiKey.startsWith("e2e-flashy-")) {
    return json(response, 401, { success: false, message: "Invalid E2E API key" });
  }
  const primary = apiKey === "e2e-flashy-primary";
  const accountId = primary ? 990001 : 990002;
  const accountName = primary ? "E2E Alpha Account" : "E2E Beta Account";

  if (url.pathname === "/account") {
    return json(response, 200, {
      success: true,
      data: {
        id: accountId,
        account: accountName,
        name: accountName,
        website: "https://example.test",
        credits: "100000",
        timezone: "Asia/Jerusalem",
        currency: "ILS",
      },
    });
  }

  const campaignDate = dateOffset(-2);
  const earlierDate = dateOffset(-5);
  const smsDate = dateOffset(-1);
  const automationDate = dateOffset(0);
  if (url.pathname === "/reports/emails") {
    const data = primary ? [
      {
        campaign_id: 990101,
        campaign_name: "E2E launch campaign",
        subject_line: "E2E launch subject",
        created_at: timestamp(campaignDate, 8),
        total_recipients: 1200,
        total_delivered: 1150,
        total_opens: 510,
        unique_clicks: 95,
        total_clicks: 130,
        purchases: 14,
        revenue_generated: "8400",
      },
      {
        campaign_id: 990102,
        campaign_name: "E2E retention campaign",
        subject_line: "E2E retention subject",
        created_at: timestamp(earlierDate, 11),
        total_recipients: 900,
        total_delivered: 870,
        total_opens: 330,
        unique_clicks: 55,
        total_clicks: 70,
        purchases: 7,
        revenue_generated: "3500",
      },
    ] : [];
    return json(response, 200, { success: true, data });
  }
  if (url.pathname === "/reports/sms") {
    const data = primary ? [{
      campaign_id: 990201,
      campaign_name: "E2E SMS campaign",
      created_at: timestamp(smsDate, 9),
      total_recipients: 1000,
      total_delivered: 970,
      unique_clicks: 80,
      total_clicks: 92,
      purchases: 9,
      revenue_generated: "4200",
    }] : [];
    return json(response, 200, { success: true, data });
  }
  if (url.pathname === "/reports/automations") {
    const data = primary && inRequestedWindow(automationDate, url) ? [{
      automation_id: 990301,
      automation_title: "E2E welcome automation",
      date: automationDate,
      sent_emails: 420,
      opened_emails: 210,
      clicked_emails: 40,
      total_recipients: 420,
      total_delivered: 410,
      total_opens: 210,
      total_clicks: 40,
      total_entered: 430,
      total_completed: 390,
      purchases: 11,
      revenues: "5100",
    }] : [];
    return json(response, 200, { success: true, data });
  }

  return json(response, 404, { success: false, message: `Unhandled E2E path: ${url.pathname}` });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`E2E mock services listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
