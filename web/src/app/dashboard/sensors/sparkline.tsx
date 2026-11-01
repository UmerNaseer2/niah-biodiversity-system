"use client";

import { useState } from "react";

export type ChartPoint = {
  /** Where it sits along the chart, 0 to 1. */
  at: number;
  value: number;
  /** "2:14 pm, 42%", for the hover label */
  text: string;
  /** True when the gap since the last point is too long to join with a line. */
  afterGap: boolean;
};

const W = 240;
const H = 56;
const PAD = 6;

/**
 * One measure over time for one node, on a scale of its own, so there's never a second axis to
 * misread. The server works out every label, because a client component can't format dates without
 * the server and browser disagreeing. The table below each chart has the same numbers for keyboard
 * and screen reader users.
 */
export function Sparkline({
  id,
  title,
  label,
  points,
  floor,
  ceiling,
  limits,
  quietFrom,
  from,
}: {
  id: string;
  title: string;
  label: string;
  points: ChartPoint[];
  floor: number;
  ceiling: number;
  /** Values to draw a dashed line at. These are the alert limits. */
  limits: number[];
  /** Where the node's readings stop, 0 to 1, if it has gone quiet. The rest is hatched. */
  quietFrom: number | null;
  from: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const x = (at: number) => at * W;
  const y = (value: number) => PAD + ((ceiling - value) / (ceiling - floor)) * (H - PAD * 2);

  const runs: ChartPoint[][] = [];
  for (const point of points) {
    if (point.afterGap || runs.length === 0) runs.push([point]);
    else runs[runs.length - 1].push(point);
  }

  function nearest(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const at = (event.clientX - box.left) / box.width;
    let best = 0;
    points.forEach((point, index) => {
      if (Math.abs(point.at - at) < Math.abs(points[best].at - at)) best = index;
    });
    setActive(best);
  }

  const shown = active === null ? undefined : points[active];
  const quiet = quietFrom !== null;

  return (
    <figure>
      <figcaption className="text-sm text-moss">{title}</figcaption>
      <div
        className="relative mt-1 touch-pan-y"
        onPointerMove={points.length > 0 ? nearest : undefined}
        onPointerDown={points.length > 0 ? nearest : undefined}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          viewBox={`-4 0 ${W + 8} ${H}`}
          role="img"
          aria-label={label}
          className="block h-14 w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern
              id={`gap-${id}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-bad" strokeWidth="1.2" strokeOpacity="0.4" />
            </pattern>
          </defs>
          <line x1="0" y1={H - 1} x2={W} y2={H - 1} className="stroke-line" strokeWidth="1" />
          {limits.map((limit) => (
            <line
              key={limit}
              x1="0"
              y1={y(limit)}
              x2={W}
              y2={y(limit)}
              className="stroke-pencil"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {quietFrom !== null && (
            <rect x={x(quietFrom)} y="0" width={W - x(quietFrom)} height={H} fill={`url(#gap-${id})`} />
          )}
          {runs.map((run, index) => {
            // A single reading between two gaps is drawn as a dot, because a line needs two ends
            const coords = (run.length === 1 ? [run[0], run[0]] : run)
              .map((point) => `${x(point.at)},${y(point.value)}`)
              .join(" ");
            return (
              <polyline
                key={index}
                points={coords}
                fill="none"
                className={quiet ? "stroke-pencil" : "stroke-forest"}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {shown && (
            <line
              x1={x(shown.at)}
              y1="0"
              x2={x(shown.at)}
              y2={H}
              className="stroke-ink"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {shown && (
          <p
            aria-hidden="true"
            style={{ left: `${shown.at * 100}%` }}
            className={`pointer-events-none absolute -top-1 z-10 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-xs font-bold text-paper ${
              shown.at > 0.66 ? "-translate-x-full" : shown.at > 0.33 ? "-translate-x-1/2" : ""
            }`}
          >
            {shown.text}
          </p>
        )}
      </div>
      <div
        aria-hidden="true"
        className="mt-1 flex justify-between font-mono text-[0.6875rem] text-moss"
      >
        <span>{from}</span>
        <span className="flex gap-3">
          {quiet && <span className="font-bold text-bad">no data</span>}
          <span>now</span>
        </span>
      </div>
    </figure>
  );
}
