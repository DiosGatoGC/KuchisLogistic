import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UpcomingModule } from "@/features/modules/upcoming-module";

export default function TableStatusPage() {
  return (
    <CapabilityGuard anyOf={["tables.operate"]}>
      <UpcomingModule title="Estado de mesas" description="La supervisión general de mesas llegará en el próximo objetivo." icon="eye" />
    </CapabilityGuard>
  );
}
