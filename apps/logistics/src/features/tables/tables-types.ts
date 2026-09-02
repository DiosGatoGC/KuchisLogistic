import type { UserRole } from "@/types/auth";

export type ServicePointType = "TABLE" | "BAR" | "TAKEAWAY";
export type ActiveServiceSessionStatus = "OPEN" | "AWAITING_PAYMENT";
export type ServiceSessionStatus =
  | ActiveServiceSessionStatus
  | "PAID"
  | "CANCELLED";

export interface ActiveServiceSession {
  id: string;
  status: ActiveServiceSessionStatus;
  openedAt: string;
}

export interface ServicePointStatus {
  id: string;
  name: string;
  type: ServicePointType;
  sortOrder: number;
  isActive: boolean;
  isOccupied: boolean;
  activeSession: ActiveServiceSession | null;
}

export interface ServiceSessionDetail {
  id: string;
  status: ServiceSessionStatus;
  openedAt: string;
  servicePoint: {
    id: string;
    name: string;
    type: ServicePointType;
  };
  shift: {
    id: string;
  };
  openedBy: {
    id: string;
    fullName: string;
    role: UserRole;
  };
}

export interface ReleasedServiceSession {
  serviceSessionId: string;
  shiftId: string;
  sessionStatus: "CANCELLED";
  reason: string;
  businessAmount: 0;
  releasedAt: string;
  releasedBy: string;
  releasedByRole: UserRole;
}

export interface ServicePointStatusResult {
  servicePoints: ServicePointStatus[];
}

export interface ServiceSessionResult {
  session: ServiceSessionDetail;
}

export interface ReleaseServiceSessionResult {
  session: ReleasedServiceSession;
}
