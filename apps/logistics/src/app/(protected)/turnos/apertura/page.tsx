import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UpcomingModule } from "@/features/modules/upcoming-module";

export default function ShiftOpeningPage() {
  return (
    <CapabilityGuard anyOf={["shift.open"]}>
      <UpcomingModule title="Apertura de turno" description="El flujo de apertura se incorporará en un objetivo posterior." icon="clock-in" />
    </CapabilityGuard>
  );
}
