"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import type { SensorAlert } from "@/data/sensors";
import { ALERT_LEVEL } from "@/lib/alert-level";

export type AlertItem = {
  id: string;
  sensorId: string;
  plot: string;
  level: SensorAlert["level"];
  title: string;
  detail: string;
  at: string;
};

export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ elementId: string } | null>(
    null,
  );

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.elementId)?.focus();
  }, [focusRequest]);

  const open = alerts.filter((a) => !acknowledged.includes(a.id));
  const done = alerts.filter((a) => acknowledged.includes(a.id));

  function acknowledge(alert: AlertItem) {
    const index = open.findIndex((a) => a.id === alert.id);
    const rest = open.filter((a) => a.id !== alert.id);
    const next = rest[index] ?? rest[index - 1];

    setAcknowledged((current) => [...current, alert.id]);
    setAnnouncement(`Acknowledged: ${alert.title}.`);
    setFocusRequest({ elementId: next ? `alert-${next.id}` : "alerts-clear" });
  }

  function undo(alert: AlertItem) {
    setAcknowledged((current) => current.filter((id) => id !== alert.id));
    setAnnouncement(`${alert.title} is back in open alerts.`);
    setFocusRequest({ elementId: `alert-${alert.id}` });
  }

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {open.length === 0 ? (
        <div className="card mt-4 flex items-center gap-4 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
            <Icon name="check" />
          </span>
          <div>
            <h3 id="alerts-clear" tabIndex={-1} className="font-bold">
              No open alerts
            </h3>
            <p className="text-sm text-moss">
              New ones show up here and in the staff menu.
            </p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {open.map((alert) => (
            <li
              key={alert.id}
              className={`flex flex-col gap-4 rounded-xl border border-l-4 border-line bg-sheet p-4 sm:flex-row sm:items-start sm:p-5 ${
                alert.level === "urgent" ? "border-l-bad" : "border-l-pencil"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-moss">
                  <span
                    className={`rounded-full px-2 py-px text-xs font-bold ${ALERT_LEVEL[alert.level].badge}`}
                  >
                    {ALERT_LEVEL[alert.level].label}
                  </span>
                  <span className="font-mono font-bold text-ink">{alert.sensorId}</span>
                  <span>
                    {alert.plot} · {alert.at}
                  </span>
                </p>
                <h3
                  id={`alert-${alert.id}`}
                  tabIndex={-1}
                  className="mt-2 font-bold"
                >
                  {alert.title}
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-moss">{alert.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => acknowledge(alert)}
                className="btn btn-secondary self-start"
              >
                <Icon name="check" className="size-4" />
                Acknowledge
                <span className="sr-only">: {alert.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-moss">
            Acknowledged in this session
          </h3>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-sheet">
            {done.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <Icon name="check" className="size-4 text-ok" />
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-bold">{alert.title}</span>
                  <span className="text-moss"> · {alert.at}</span>
                </p>
                <button
                  type="button"
                  onClick={() => undo(alert)}
                  className="btn btn-secondary"
                >
                  <Icon name="undo" className="size-4" />
                  Undo
                  <span className="sr-only"> acknowledging {alert.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
