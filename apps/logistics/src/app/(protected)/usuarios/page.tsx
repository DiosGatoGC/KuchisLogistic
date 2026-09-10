import { CapabilityGuard } from "@/features/auth/auth-guards";
import { UsersView } from "@/features/users/users-view";

export default function UsersPage() {
  return (
    <CapabilityGuard anyOf={["users.manage"]}>
      <UsersView />
    </CapabilityGuard>
  );
}
