"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A link that sets aria-current when you're on its page (or below it) */
export function NavLink({
  href,
  exact = false,
  className,
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
