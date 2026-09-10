import { CapabilityGuard } from "@/features/auth/auth-guards";
import { HistoryListView } from "@/features/history/history-list-view";

export default function HistoryPage() {
  return (
    <CapabilityGuard anyOf={["history.view"]}>
      <HistoryListView />
    </CapabilityGuard>
  );
}
