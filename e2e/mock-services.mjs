import { createServer } from "node:http";

const port = Number(process.env.E2E_MOCK_PORT || 3061);
const resendMessages = [];

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

  if (url.pathname === "/emails" && request.method === "POST") {
    if (request.headers.authorization !== "Bearer e2e-resend-key") {
      return json(response, 401, { message: "Invalid E2E Resend key" });
    }
    const body = await requestBody(request);
    const key = request.headers["idempotency-key"];
    const existing = key && resendMessages.find(message => message.key === key);
    if (existing) return json(response, 200, { id: existing.id });
    resendMessages.push({ ...body, key, id: `e2e-email-${resendMessages.length + 1}` });
    return json(response, 200, { id: resendMessages.at(-1).id });
  }

  if (url.pathname === "/test/resend-latest") {
    const to = url.searchParams.get("to");
    const messages = to
      ? resendMessages.filter((message) => Array.isArray(message.to) && message.to.includes(to))
      : resendMessages;
    return json(response, 200, { count: messages.length, data: messages.at(-1) ?? null });
  }

  if (url.pathname === "/v1/responses" && request.method === "POST") {
    const body = await requestBody(request);
    const format = body.text?.format?.name;
    if (format?.startsWith("website_")) {
      if (request.headers.authorization !== "Bearer e2e-openai-key") return json(response, 401, { error: "Invalid E2E OpenAI key" });
      const input = JSON.parse(body.input);
      let output;
      if (format === "website_research_map") {
        const chunk = input.chunks.find(chunk => chunk.untrustedWebsiteData.includes("handmade chocolate"));
        output = { items: chunk ? [{ category: "audiences", classification: "inferred_hypothesis", summary: "קהל שמחפש מתנות שוקולד", chunkIds: [chunk.chunkId], uncertainty: "השערה הדורשת אישור לקוח", qualifiers: [] }] : [] };
      } else if (format === "website_research_review") {
        output = { decisions: input.untrustedCandidates.map(item => ({ index: item.index, accept: true, reason: "supported" })) };
      } else if (format === "website_finding_review") {
        output = { decisions: input.candidates.map(item => ({ index: item.index, approved: true, reason: "supported" })) };
      } else if (format === "website_observations" && input.evidenceChoices) {
        const mapping = { brand_voice: ["voice", "tone"], products_commercial: ["products", "subscriptions"], audience_problems: ["audience", "audience_likely"], differentiation_operations: ["differentiation", "differentiators_claim"] };
        const [category, key] = mapping[input.task];
        const evidence = input.evidenceChoices.find(item => (key === "subscriptions" ? /subscription/ : /handmade chocolate|carefully selected ingredients/).test(item.text));
        output = { findings: evidence ? [{ category, key, evidenceRef: evidence.id, interpretation: key === "tone" ? "סגנון המדגיש מתנות ורכיבים" : key === "audience_likely" ? "קהל שמחפש מתנות שוקולד" : "", observationStatus: ["tone", "audience_likely"].includes(key) ? "inferred" : "observed", confidence: "medium" }] : [] };
      }
      if (output) return json(response, 200, { output_text: JSON.stringify(output), usage: { input_tokens: 1000, output_tokens: 100 }, status: "completed" });
    }
    if (body.text?.format?.name === "website_observations") {
      const input = JSON.parse(body.input);
      const mapping = { brand_voice: ["brand", "brand_description"], products_commercial: ["products", "benefits"], audience_problems: ["audience", "audience_likely"], differentiation_operations: ["operations", "shipping"] };
      const [category, key] = mapping[input.task];
      const source = input.sources[0];
      const inferred = key === "audience_likely";
      const findings = [{ category, key, value: { summary: inferred ? "ממצא מבוסס ממקור האתר" : source.untrustedWebsiteText.slice(0, 80), details: [] }, sourceId: source.id, evidence: source.untrustedWebsiteText.slice(0, 120), observationStatus: inferred ? "inferred" : "observed", confidence: "high" }];
      return json(response, 200, { output_text: JSON.stringify({ findings }), usage: { input_tokens: 1000, output_tokens: 100 }, status: "completed" });
    }
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
  const foundation = apiKey === "e2e-flashy-foundation";
  const concurrent = apiKey === "e2e-flashy-concurrent";
  const accountId = concurrent ? 990005 : foundation ? 990004 : primary ? 990001 : 990002;
  const accountName = foundation ? "E2E Foundation Account" : primary ? "E2E Alpha Account" : "E2E Beta Account";

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
  const automationDate = dateOffset(-1);
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
        unsubscribed: 4,
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
        unsubscribed: 3,
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
      unsubscribed: 5,
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
