import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UpcomingModule } from "@/features/modules/upcoming-module";

export default function ShiftClosingPage() {
  return (
    <CapabilityGuard anyOf={["shift.close"]}>
      <UpcomingModule title="Cierre de turno" description="El cierre de jornada se incorporará en un objetivo posterior." icon="clock-out" />
    </CapabilityGuard>
  );
}
