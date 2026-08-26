import type { UserRole } from "../../authorization/roles";

export interface PublicShift {
  id: string;
  status: "OPEN" | "CLOSED";
  openingCash: number;
  openedAt: string;
  closedAt: string | null;
  openedBy: {
    id: string;
    role: UserRole;
  };
  closedBy: {
    id: string;
    role: UserRole;
  } | null;
}
