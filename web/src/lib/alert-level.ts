import type { AlertSeverity } from "@/lib/iot";

export const ALERT_LEVEL: Record<AlertSeverity, { label: string; badge: string }> = {
  urgent: { label: "Urgent", badge: "bg-bad text-white" },
  routine: { label: "Routine", badge: "border border-line bg-paper text-moss" },
};
