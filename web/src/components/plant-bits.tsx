import { CONDITION_LABEL, type Condition } from "@/lib/condition";
import { IUCN, IUCN_ORDER, type IucnCode } from "@/lib/iucn";
import { Icon } from "./icon";

/** Binomial in italics, authority in roman, the way botanists write it */
export function LatinName({
  name,
  authority,
  className = "",
}: {
  name: string;
  authority?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="font-latin italic">{name}</span>
      {authority && (
        <span className="text-[0.8em] text-moss"> {authority}</span>
      )}
    </span>
  );
}

// Red List colours. Light ones get dark text, dark ones get white.
const IUCN_SWATCH: Record<IucnCode, string> = {
  LC: "bg-iucn-lc text-ink",
  NT: "bg-iucn-nt text-ink",
  VU: "bg-iucn-vu text-ink",
  EN: "bg-iucn-en text-ink",
  CR: "bg-iucn-cr text-white",
  EW: "bg-iucn-ew text-white",
  EX: "bg-iucn-ex text-white",
};

export function IucnChip({
  code,
  className = "",
}: {
  code: IucnCode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-line bg-sheet py-0.5 pl-0.5 pr-2 text-xs font-bold ${className}`}
    >
      <span
        className={`rounded-[0.3rem] px-1.5 py-px font-mono ${IUCN_SWATCH[code]}`}
        aria-hidden="true"
      >
        {code}
      </span>
      <span>
        <span className="sr-only">IUCN status: </span>
        {IUCN[code].label}
      </span>
    </span>
  );
}

/** The Red List scale from Least Concern to Extinct, with this species marked */
export function IucnScale({ code }: { code: IucnCode }) {
  return (
    <figure>
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center">
        <span className="col-span-2" />
        <div className="col-span-3 mb-1">
          <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-widest text-moss">
            Threatened
          </p>
          <div className="mx-1 h-2 rounded-t-md border-x-2 border-t-2 border-moss/60" />
        </div>
        <span className="col-span-2" />
        {IUCN_ORDER.map((step) => (
          <span
            key={step}
            className={`rounded-md py-1.5 font-mono text-sm font-bold ${
              step === code
                ? `${IUCN_SWATCH[step]} ring-2 ring-ink ring-offset-2 ring-offset-sheet`
                : "border border-line bg-paper text-moss"
            }`}
          >
            {step}
          </span>
        ))}
        <span className="col-span-2 mt-1 text-left text-xs text-moss">
          Least risk
        </span>
        <span className="col-span-3" />
        <span className="col-span-2 mt-1 text-right text-xs text-moss">
          Extinct
        </span>
      </div>
      <figcaption className="mt-4">
        <span className="font-bold">
          {IUCN[code].label} ({code})
        </span>{" "}
        on the IUCN Red List. {IUCN[code].meaning}
      </figcaption>
    </figure>
  );
}

const CONDITION_STYLE: Record<Condition, string> = {
  healthy: "bg-ok-soft text-ok",
  damaged: "bg-warn-soft text-warn",
  diseased: "bg-bad-soft text-bad",
};

export function ConditionBadge({ condition }: { condition: Condition }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${CONDITION_STYLE[condition]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {CONDITION_LABEL[condition]}
    </span>
  );
}

/** Shown wherever a species keeps its exact location from the public */
export function HiddenLocationBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-sheet px-2 py-0.5 text-xs font-bold text-moss">
      <Icon name="lock" className="size-3.5" />
      Location hidden
    </span>
  );
}

export function ProtectedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-forest/30 bg-forest-soft px-2 py-0.5 text-xs font-bold text-forest-deep">
      <Icon name="leaf" className="size-3.5" />
      Protected in Sarawak
    </span>
  );
}

/** Pencil hatching where a photo will go */
export function PhotoPlaceholder({
  className = "",
  showIcon = true,
}: {
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`hatch flex items-center justify-center rounded-lg border border-line text-pencil ${className}`}
    >
      {showIcon && <Icon name="camera" className="size-6" />}
    </div>
  );
}
