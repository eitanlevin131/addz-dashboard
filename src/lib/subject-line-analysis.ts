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
