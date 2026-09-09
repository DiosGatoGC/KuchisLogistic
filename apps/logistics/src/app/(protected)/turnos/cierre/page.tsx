import { CapabilityGuard } from "@/features/auth/auth-guards";
import { ShiftClosingView } from "@/features/shifts/shift-closing-view";

export default function ShiftClosingPage() {
  return (
    <CapabilityGuard anyOf={["shift.close"]}>
      <ShiftClosingView />
    </CapabilityGuard>
  );
}
