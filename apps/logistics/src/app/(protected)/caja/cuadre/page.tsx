import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UpcomingModule } from "@/features/modules/upcoming-module";

export default function ReconciliationPage() {
  return (
    <CapabilityGuard anyOf={["cash.reconcile"]}>
      <UpcomingModule title="Cuadre de caja" description="La conciliación de caja se habilitará en un objetivo posterior." icon="cash" />
    </CapabilityGuard>
  );
}
