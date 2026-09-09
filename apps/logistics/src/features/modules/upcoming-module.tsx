"use client";

import { Icon, type IconName } from "@/components/ui/icon";

export function UpcomingModule({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: IconName;
}) {
  return (
    <div className="upcoming-page">
      <section className="upcoming-card">
        <span className="upcoming-card__icon">
          <Icon name={icon} />
        </span>
        <p className="eyebrow">Próximamente</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
    </div>
  );
}
