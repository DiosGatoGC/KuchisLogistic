export type IconName =
  | "arrow-left"
  | "book-open"
  | "calendar-check"
  | "cash"
  | "chevron-right"
  | "clipboard"
  | "clock-in"
  | "clock-out"
  | "eye"
  | "eye-off"
  | "history"
  | "lock"
  | "logout"
  | "orders"
  | "refresh"
  | "rotate"
  | "tables"
  | "users";

const paths: Record<IconName, React.ReactNode> = {
  "arrow-left": <path d="m15 18-6-6 6-6M9 12h10" />,
  "book-open": <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23.5v-18ZM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5a3.5 3.5 0 0 1 3.5 3.5v-18Z" />,
  "calendar-check": <path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 10 2 2 4-4" />,
  cash: <path d="M3 6h18v12H3V6Zm3 3a2 2 0 0 0 2-2m10 2a2 2 0 0 1-2-2M6 15a2 2 0 0 1 2 2m10-2a2 2 0 0 0-2 2m-4-7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  clipboard: <path d="M9 5h6m-6 4h6m-7 4h8m-8 4h5M9 3h6v3H9V3ZM6 5H5a1 1 0 0 0-1 1v15h16V6a1 1 0 0 0-1-1h-1" />,
  "clock-in": <path d="M12 7v5l3 2m5-2a8 8 0 1 1-2.34-5.66M17 2v5h5" />,
  "clock-out": <path d="M12 7v5l3 2m5-2a8 8 0 1 1-2.34-5.66M22 7h-5V2" />,
  eye: <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  "eye-off": <path d="m3 3 18 18M10.6 6.2A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a13 13 0 0 1-2.1 2.8M6.3 6.3C3.9 8 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2" />,
  lock: <path d="M6 10h12v11H6V10Zm3 0V7a3 3 0 0 1 6 0v3m-3 4v3" />,
  logout: <path d="M10 5H5v14h5m4-3 4-4-4-4m4 4H9" />,
  orders: <path d="M5 4h14v16H5V4Zm3 4h8M8 12h8m-8 4h5" />,
  refresh: <path d="M20 7v5h-5M4 17v-5h5m10.2-3A8 8 0 0 0 6 6.5L4 9m16 6-2 2.5A8 8 0 0 1 4.8 15" />,
  rotate: <path d="M19 8a7 7 0 1 0 1 7m-1-7V3m0 5h-5M9 8h6v9H9V8Z" />,
  tables: <path d="M4 7h16v8H4V7Zm3 8v5m10-5v5M8 4v3m8-3v3" />,
  users: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6m-14 17a7 7 0 0 1 14 0m1-7a6 6 0 0 1 5 6" />,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
