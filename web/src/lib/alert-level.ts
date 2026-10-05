import type { SensorAlert } from "@/data/sensors";

export const ALERT_LEVEL: Record<
  SensorAlert["level"],
  { label: string; badge: string }
> = {
  urgent: { label: "Urgent", badge: "bg-bad text-white" },
  routine: { label: "Routine", badge: "border border-line bg-paper text-moss" },
};
