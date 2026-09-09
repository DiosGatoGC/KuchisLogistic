import type { UserRole } from "@/types/auth";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administración",
  MANAGER: "Gerencia",
  WAITER: "Salón",
  CASHIER: "Caja",
  KITCHEN: "Cocina",
};

export function formatOperationalMoney(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatOperationalDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
