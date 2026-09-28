import { DashboardApp } from "@/components/dashboard-app";

export default async function MonthlySummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DashboardApp initialSummaryId={id} />;
}
