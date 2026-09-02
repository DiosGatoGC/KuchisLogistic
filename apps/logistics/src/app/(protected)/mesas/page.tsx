import { CapabilityGuard } from "@/features/auth/auth-guards";
import { TablesView } from "@/features/tables/tables-view";

export default function TablesPage() {
  return (
    <CapabilityGuard anyOf={["tables.view", "tables.operate"]}>
      <TablesView />
    </CapabilityGuard>
  );
}
