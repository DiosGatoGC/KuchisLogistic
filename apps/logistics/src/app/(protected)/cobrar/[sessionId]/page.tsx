import { CapabilityGuard } from "@/features/auth/auth-guards";
import { CheckoutView } from "@/features/checkout/checkout-view";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <CapabilityGuard anyOf={["tables.operate"]}>
      <CheckoutView sessionId={sessionId} />
    </CapabilityGuard>
  );
}
