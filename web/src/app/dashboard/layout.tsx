import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { LogoMark } from "@/components/logo";
import { DEMO_USER_ID, getPerson, ROLE_LABEL } from "@/data/people";
import { records } from "@/data/records";
import { sensorAlerts } from "@/data/sensors";
import { StaffNav } from "./staff-nav";

export const metadata: Metadata = {
  title: {
    default: "Staff dashboard",
    template: "%s · Staff · Niah Plant Records",
  },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const me = getPerson(DEMO_USER_ID);
  const waiting = records.filter((r) => r.status === "waiting").length;
  const urgent = sensorAlerts.filter((a) => a.level === "urgent").length;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="border-b border-line bg-sheet lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="lg:sticky lg:top-0">
          <div className="flex items-center gap-3 px-4 pt-3 lg:px-5 lg:pt-5">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-md py-1 font-bold leading-tight tracking-tight"
            >
              <LogoMark />
              <span>
                Niah Plant Records
                <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-moss">
                  Staff
                </span>
              </span>
            </Link>
            <Link href="/" className="btn btn-secondary ml-auto lg:hidden">
              Sign out
            </Link>
          </div>

          <div className="relative">
            <StaffNav waiting={waiting} urgent={urgent} />
            {/* hints that the nav scrolls sideways on small screens */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-sheet lg:hidden"
            />
          </div>

          <div className="mx-3 hidden border-t border-line px-2 py-4 lg:block">
            <p className="text-sm text-moss">Signed in as</p>
            <p className="font-bold">
              {me.name} <span className="font-normal text-moss">(demo)</span>
            </p>
            <p className="text-sm text-moss">{ROLE_LABEL[me.role]}</p>
            <Link
              href="/"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-bold text-moss hover:text-ink"
            >
              <Icon name="log-out" className="size-4" />
              Sign out
            </Link>
          </div>
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
