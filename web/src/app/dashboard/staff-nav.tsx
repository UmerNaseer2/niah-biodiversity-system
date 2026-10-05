import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import { NavLink } from "@/components/nav-link";

const LINK =
  "flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-sm font-bold text-moss transition-colors hover:bg-paper hover:text-ink aria-[current=page]:bg-forest-soft aria-[current=page]:text-forest-deep";

const BADGE =
  "ml-1 min-w-5 rounded-full px-1.5 text-center text-xs font-bold leading-5 lg:ml-auto";

type StaffLink = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  badge?: ReactNode;
};

export function StaffNav({
  waiting,
  urgent,
}: {
  waiting: number;
  urgent: number;
}) {
  const links: StaffLink[] = [
    { href: "/dashboard", label: "Overview", icon: "home", exact: true },
    {
      href: "/dashboard/review",
      label: "Review queue",
      icon: "inbox",
      badge: waiting > 0 && (
        <span className={`${BADGE} bg-ink text-paper`}>
          {waiting}
          <span className="sr-only"> waiting</span>
        </span>
      ),
    },
    { href: "/dashboard/species", label: "Species", icon: "leaf" },
    { href: "/dashboard/reports", label: "Reports", icon: "file" },
    {
      href: "/dashboard/sensors",
      label: "Sensors",
      icon: "sensor",
      badge: urgent > 0 && (
        <span className={`${BADGE} bg-bad text-white`}>
          {urgent}
          <span className="sr-only"> urgent {urgent === 1 ? "alert" : "alerts"}</span>
        </span>
      ),
    },
    { href: "/dashboard/users", label: "Users and roles", icon: "users" },
  ];

  return (
    <nav aria-label="Staff">
      {/* relative keeps the sr-only badge text inside the scroller. Without it
          that text sits past the right edge and widens the page on phones. */}
      <ul className="no-scrollbar relative flex gap-1 overflow-x-auto px-2 py-2 lg:flex-col lg:px-3 lg:py-4">
        {links.map((link) => (
          <li key={link.href} className="shrink-0">
            <NavLink href={link.href} exact={link.exact} className={LINK}>
              <Icon name={link.icon} className="size-5 shrink-0" />
              {link.label}
              {link.badge}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
