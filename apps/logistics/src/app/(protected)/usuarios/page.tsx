import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UpcomingModule } from "@/features/modules/upcoming-module";

export default function UsersPage() {
  return (
    <CapabilityGuard anyOf={["users.manage"]}>
      <UpcomingModule title="Usuarios" description="La administración del equipo se habilitará en un objetivo posterior." icon="users" />
    </CapabilityGuard>
  );
}
