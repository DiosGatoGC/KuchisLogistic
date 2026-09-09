import { CapabilityGuard } from "@/features/auth/auth-guards";
import { ShiftOpeningView } from "@/features/shifts/shift-opening-view";

export default function ShiftOpeningPage() {
  return (
    <CapabilityGuard anyOf={["shift.open"]}>
      <ShiftOpeningView />
    </CapabilityGuard>
  );
}
