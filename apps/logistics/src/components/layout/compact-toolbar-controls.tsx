import type { ReactNode } from "react";

export function CompactToolbarControls({ children }: { children: ReactNode }) {
  return <div className="compact-toolbar-controls">{children}</div>;
}
