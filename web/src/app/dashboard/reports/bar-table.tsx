import type { ReactNode } from "react";
import { plural } from "@/lib/format";
import type { Count } from "@/lib/reports";

/**
 * A bar chart that is really a table, so a screen reader reads it as one and
 * it still makes sense printed or with styles off. One colour for every bar,
 * since the bars are one series, and the number sits at the end of each bar.
 */
export function BarTable({
  id,
  title,
  description,
  labelHeading,
  counts,
  className = "",
}: {
  id: string;
  title: string;
  description?: ReactNode;
  labelHeading: string;
  counts: Count[];
  className?: string;
}) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={`card break-inside-avoid p-5 sm:p-6 ${className}`}
    >
      <h2 id={`${id}-heading`} className="text-lg font-bold tracking-tight">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-moss">{description}</p>}
      <table aria-labelledby={`${id}-heading`} className="mt-4 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">{labelHeading}</th>
            <th scope="col">Records</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((c) => (
            <tr
              key={c.key}
              title={`${c.label}: ${plural(c.count, "record")}`}
              className="group"
            >
              <th
                scope="row"
                className="w-2/5 py-1.5 pr-3 text-left align-middle font-normal"
              >
                {c.label}
              </th>
              {/* The cell's left border is the baseline the bars grow from */}
              <td className="border-l border-pencil p-0 align-middle">
                <div className="flex min-h-8 items-center gap-2">
                  {c.count > 0 && (
                    <span
                      aria-hidden="true"
                      className="block h-5 rounded-r-[4px] bg-forest [print-color-adjust:exact] group-hover:bg-forest-deep"
                      style={{ width: `${(c.count / max) * 80}%` }}
                    />
                  )}
                  <span
                    className={`font-bold tabular-nums ${c.count === 0 ? "pl-2 text-moss" : ""}`}
                  >
                    {c.count}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
