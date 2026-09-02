import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UpcomingModule } from "@/features/modules/upcoming-module";

export default function CatalogPage() {
  return (
    <CapabilityGuard anyOf={["catalog.availability"]}>
      <UpcomingModule title="Actualizar carta" description="Aquí podrás gestionar la disponibilidad de productos." icon="book-open" />
    </CapabilityGuard>
  );
}
