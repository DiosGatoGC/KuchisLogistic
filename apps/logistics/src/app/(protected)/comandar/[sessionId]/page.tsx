import { CapabilityGuard } from "@/features/auth/auth-guards";
import { OrderingView } from "@/features/ordering/ordering-view";

export default async function OrderingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <CapabilityGuard anyOf={["tables.view"]}>
      <CapabilityGuard anyOf={["orders.create"]}>
        <OrderingView sessionId={sessionId} />
      </CapabilityGuard>
    </CapabilityGuard>
  );
}

