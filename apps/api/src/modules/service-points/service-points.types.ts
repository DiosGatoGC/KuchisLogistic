import type { Database } from "@kuchis/shared/database-types";
import type { UserRole } from "../../authorization/roles";

export type ServicePointType =
  Database["public"]["Enums"]["service_point_type"];
export type ServiceSessionStatus =
  Database["public"]["Enums"]["session_status"];

export interface PublicServicePoint {
  id: string;
  name: string;
  type: ServicePointType;
  sortOrder: number;
  isActive: boolean;
}

export interface ServicePointStatus extends PublicServicePoint {
  isOccupied: boolean;
  activeSession: {
    id: string;
    status: "OPEN" | "AWAITING_PAYMENT";
    openedAt: string;
  } | null;
}

export interface PublicServiceSession {
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
