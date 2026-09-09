import { CapabilityGuard } from "@/features/auth/auth-guards";
import { CatalogAvailabilityView } from "@/features/catalog-availability/catalog-availability-view";

export default function CatalogPage() {
  return (
    <CapabilityGuard anyOf={["tables.view"]}>
      <CatalogAvailabilityView />
    </CapabilityGuard>
  );
}
