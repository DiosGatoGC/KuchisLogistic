import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";

export function ActionTile({
  href,
  icon,
  title,
  description,
  accent = false,
}: {
  href: string;
  icon: IconName;
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <Link className="action-tile" data-accent={accent} href={href}>
      <span className="action-tile__icon">
        <Icon name={icon} />
      </span>
      <span className="action-tile__copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Icon name="chevron-right" className="action-tile__arrow" />
    </Link>
  );
}
