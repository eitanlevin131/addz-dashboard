export type SubjectLineReportInput = {
  campaignId: number;
  name: string;
  subject: string;
  sentAt?: string;
  delivered: number;
  opens: number;
  clicks: number;
  purchases: number;
  revenue: number;
};

export type SubjectLineEvidence = SubjectLineReportInput & {
  openRate: number;
  clickRate: number;
  purchaseRate: number;
  revenuePerThousand: number;
};

export type SubjectLineEvidenceSet = {
  examples: SubjectLineEvidence[];
  eligibleCampaigns: number;
  totalCampaigns: number;
  minimumDelivered: number;
};

const claimRules = [
  {
    label: "הנחה, מחיר או מתנה שלא אושרו",
    copy: /(?:\d+\s*%|הנח|קופון|מתנה|חינם|₪|ש[\"״']?ח)/i,
    approved: /(?:\d+\s*%|הנח|קופון|מתנה|חינם|₪|ש[\"״']?ח)/i,
  },
  {
    label: "דדליין שלא אושר",
    copy: /(?:רק היום|היום בלבד|עד חצות|מחר בלבד|הזדמנות אחרונה|יום אחרון|לזמן מוגבל|אל תחמיצו|אל תפספסו|מהרו)/i,
    approved: /(?:רק היום|היום בלבד|עד חצות|מחר בלבד|הזדמנות אחרונה|יום אחרון|לזמן מוגבל|אל תחמיצו|אל תפספסו|מהרו)/i,
  },
  {
    label: "מחסור או מלאי שלא אושרו",
    copy: /(?:לפני שייגמר|לפני שנגמר|עד גמר|גמר המלאי|יחידות אחרונות|המלאי אוזל)/i,
    approved: /(?:ייגמר|נגמר|עד גמר|מלאי|יחידות אחרונות|אוזל)/i,
  },
  {
    label: "טענת משלוח שלא אושרה",
    copy: /(?:משלוח חינם|משלוח מהיר|משלוח מהיום להיום)/i,
    approved: /(?:משלוח חינם|משלוח מהיר|משלוח מהיום להיום)/i,
  },
  {
    label: "טענת איכות או פופולריות שלא אושרה",
    copy: /(?:הכי נמכר|רב[־-]?מכר|מספר\s*1|מומלץ|מקצועי|מובטח|בלעדי)/i,
    approved: /(?:הכי נמכר|רב[־-]?מכר|מספר\s*1|מומלץ|מקצועי|מובטח|בלעדי)/i,
  },
  {
    label: "טענת חדשנות שלא אושרה",
    copy: /(?:חדש(?:ה|ים|ות)?)/i,
    approved: /(?:חדש(?:ה|ים|ות)?)/i,
  },
] as const;

export function findUnsupportedSubjectClaims(copy: string, approvedText: string) {
  const affirmativeApprovedText = approvedText.replace(
    /(?:ללא|בלי|אין)\s+(?:הבטחת\s+)?(?:\d+\s*%\s*)?(?:הנחה|קופון|מתנה|משלוח|מלאי|דדליין|תאריך סיום)/gi,
    "",
  );
  return claimRules
    .filter((rule) => rule.copy.test(copy) && !rule.approved.test(affirmativeApprovedText))
    .map((rule) => rule.label);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function metricRows(rows: SubjectLineReportInput[]): SubjectLineEvidence[] {
  return rows.map((row) => ({
    ...row,
    openRate: row.delivered > 0 ? row.opens / row.delivered : 0,
    clickRate: row.delivered > 0 ? row.clicks / row.delivered : 0,
    purchaseRate: row.delivered > 0 ? row.purchases / row.delivered : 0,
    revenuePerThousand: row.delivered > 0 ? (row.revenue / row.delivered) * 1_000 : 0,
  }));
}

export function buildSubjectLineEvidence(rows: SubjectLineReportInput[], limit = 18): SubjectLineEvidenceSet {
  const usable = rows.filter((row) => row.subject.trim() && row.subject !== "ללא שורת נושא" && row.delivered > 0);
  const typicalVolume = median(usable.map((row) => row.delivered));
  const minimumDelivered = Math.max(200, Math.floor(typicalVolume * 0.2));
  const eligible = metricRows(usable.filter((row) => row.delivered >= minimumDelivered));
  const candidates = eligible.length >= 4 ? eligible : metricRows(usable);
  const selected = new Map<number, SubjectLineEvidence>();
  const take = (sorter: (a: SubjectLineEvidence, b: SubjectLineEvidence) => number) => {
    for (const row of [...candidates].sort(sorter).slice(0, 6)) selected.set(row.campaignId, row);
  };

  take((a, b) => b.openRate - a.openRate || b.delivered - a.delivered);
  take((a, b) => b.clickRate - a.clickRate || b.openRate - a.openRate);
  take((a, b) => b.revenuePerThousand - a.revenuePerThousand || b.purchaseRate - a.purchaseRate);
  take((a, b) => b.revenue - a.revenue || b.purchases - a.purchases);

  return {
    examples: Array.from(selected.values())
      .sort((a, b) => b.revenuePerThousand - a.revenuePerThousand || b.openRate - a.openRate)
      .slice(0, limit),
    eligibleCampaigns: eligible.length,
    totalCampaigns: usable.length,
    minimumDelivered,
  };
}
