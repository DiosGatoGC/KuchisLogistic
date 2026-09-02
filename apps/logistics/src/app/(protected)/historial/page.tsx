import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UpcomingModule } from "@/features/modules/upcoming-module";

export default function HistoryPage() {
  return (
    <CapabilityGuard anyOf={["history.view"]}>
      <UpcomingModule title="Historial" description="La consulta del historial estará disponible próximamente." icon="history" />
    </CapabilityGuard>
  );
}
