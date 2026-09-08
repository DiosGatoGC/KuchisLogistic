import { CapabilityGuard } from "@/features/auth/auth-guards";
import { TableOperationsView } from "@/features/table-operations/table-operations-view";

export default function TableStatusPage() {
  return (
    <CapabilityGuard anyOf={["tables.view"]}>
      <TableOperationsView />
    </CapabilityGuard>
  );
}
