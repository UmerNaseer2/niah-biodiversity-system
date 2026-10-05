import { Fragment, type ReactNode } from "react";
import { itemsLabel } from "@/lib/format";
import { sprintFor } from "@/lib/release";

/** "Planned", "Item 18", "Sprint 2" */
export function plannedParts(items: number[]) {
  const sprint = sprintFor(items);
  return ["Planned", itemsLabel(items), ...(sprint ? [sprint] : [])];
}

/**
 * A strip of pink flagging tape. Field teams tie it on trees they still need
 * to come back to, and here it marks anything that is not built yet.
 */
export function Tape({
  parts,
  className = "",
}: {
  parts: string[];
  className?: string;
}) {
  return (
    <span className={`tape ${className}`}>
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <span>
            {index > 0 && <span className="sr-only">, </span>}
            {part}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

export function PlannedTape({
  items,
  className,
}: {
  items: number[];
  className?: string;
}) {
  return <Tape parts={plannedParts(items)} className={className} />;
}

/** A dashed box for a feature that isn't built, with the tape tied on top */
export function Planned({
  items,
  title,
  children,
  className = "",
}: {
  items: number[];
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-xl border-2 border-dashed border-pencil/45 bg-sheet/70 px-4 pb-4 pt-6 sm:px-5 ${className}`}
    >
      <PlannedTape
        items={items}
        className="absolute left-3 top-0 -translate-y-1/2 -rotate-1 sm:left-4"
      />
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1 text-sm text-moss">{children}</div>}
    </div>
  );
}
