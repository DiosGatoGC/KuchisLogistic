import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UpcomingModule } from "@/features/modules/upcoming-module";

export default function OrdersPage() {
  return (
    <CapabilityGuard anyOf={["orders.kitchen.view", "orders.kitchen.manage", "orders.drinks.view", "orders.drinks.manage"]}>
      <UpcomingModule title="Pedidos" description="Las vistas operativas de Cocina y Bebidas se habilitarán próximamente." icon="orders" />
    </CapabilityGuard>
  );
}
