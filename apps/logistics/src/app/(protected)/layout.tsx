import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { LandscapeGate } from "@/components/layout/landscape-gate";
import { PageShell } from "@/components/layout/page-shell";
import { AuthenticatedGuard } from "@/features/auth/auth-guards";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthenticatedGuard>
      <LandscapeGate>
        <AppShell>
          <PageShell>{children}</PageShell>
        </AppShell>
      </LandscapeGate>
    </AuthenticatedGuard>
  );
}
