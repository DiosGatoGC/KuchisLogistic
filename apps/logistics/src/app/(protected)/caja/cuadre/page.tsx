import { CapabilityGuard } from "@/features/auth/auth-guards";
import { ReconciliationView } from "@/features/shifts/reconciliation-view";

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ shiftId?: string | string[] }>;
}) {
  const { shiftId } = await searchParams;
  return (
    <CapabilityGuard anyOf={["cash.reconcile"]}>
      <ReconciliationView shiftId={typeof shiftId === "string" ? shiftId : null} />
    </CapabilityGuard>
  );
}
