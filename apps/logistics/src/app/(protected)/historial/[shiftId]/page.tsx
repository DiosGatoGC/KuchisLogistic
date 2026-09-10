import { CapabilityGuard } from "@/features/auth/auth-guards";
import { HistoryDetailView } from "@/features/history/history-detail-view";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ shiftId: string }>;
}) {
  const { shiftId } = await params;
  return (
    <CapabilityGuard anyOf={["history.view"]}>
      <HistoryDetailView shiftId={shiftId} />
    </CapabilityGuard>
  );
}
