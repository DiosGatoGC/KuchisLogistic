import { CapabilityGuard } from "@/features/auth/auth-guards";
import { PreparationView } from "@/features/preparation/preparation-view";

export default function OrdersPage() {
  return (
    <CapabilityGuard anyOf={["orders.kitchen.view", "orders.kitchen.manage", "orders.drinks.view", "orders.drinks.manage"]}>
      <PreparationView />
    </CapabilityGuard>
  );
}
