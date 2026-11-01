"use client";

import { usePathname } from "next/navigation";
import { useVisibleTimer } from "@/lib/use-visible-timer";
import { checkUrgentCount } from "./sensors/actions";

// Edge devices send every 10 seconds, so 15 here leaves room inside the 30 second goal in the
// proposal, the same as the sensors page
const WATCH_MS = 15000;

/**
 * Keeps the red badge in the staff menu right on every dashboard page. It only asks for the count,
 * and the page only redraws when the count has changed, so nobody's review queue gets reloaded for
 * nothing. The sensors page has its own faster refresh, which redraws the badge as well.
 */
export function AlertWatcher({ urgent }: { urgent: number }) {
  const pathname = usePathname();
  useVisibleTimer(async () => {
    if (pathname !== "/dashboard/sensors") await checkUrgentCount(urgent);
  }, WATCH_MS);
  return null;
}
