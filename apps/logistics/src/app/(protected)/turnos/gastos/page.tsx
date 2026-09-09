import { CapabilityGuard } from "@/features/auth/auth-guards";
import { ExpensesView } from "@/features/expenses/expenses-view";

export default function ShiftExpensesPage() {
  return (
    <CapabilityGuard anyOf={["expenses.view"]}>
      <ExpensesView />
    </CapabilityGuard>
  );
}
