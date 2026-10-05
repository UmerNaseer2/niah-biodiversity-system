import Link from "next/link";

// The metal tag that gets nailed to each recorded plant. The square pattern
// is made from the tag code so every tag looks different, but it is NOT a
// real QR code yet. Generating real ones is item 12.

const QR_SIZE = 21;
const FINDERS = [
  [0, 0],
  [0, QR_SIZE - 7],
  [QR_SIZE - 7, 0],
];

function hash(text: string) {
  // FNV-1a, enough to turn a code into a seed
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function finderModule(row: number, col: number) {
  for (const [top, left] of FINDERS) {
    const r = row - top;
    const c = col - left;
    // The 7 by 7 square plus a 1 module white gap around it
    if (r >= -1 && r <= 7 && c >= -1 && c <= 7) {
      if (r < 0 || r > 6 || c < 0 || c > 6) return false;
      const ring = r === 0 || r === 6 || c === 0 || c === 6;
      const centre = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      return ring || centre;
    }
  }
  return null;
}

function qrPath(code: string) {
  let state = hash(code) || 1;
  const nextBit = () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state >>> 11) & 1;
  };

  let d = "";
  for (let row = 0; row < QR_SIZE; row++) {
    for (let col = 0; col < QR_SIZE; col++) {
      let dark = finderModule(row, col);
      if (dark === null) {
        if (row === 6) dark = col % 2 === 0;
        else if (col === 6) dark = row % 2 === 0;
        else dark = nextBit() === 1;
      }
      if (dark) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return d;
}

const SIZES = {
  sm: { width: "w-28", park: "text-[0.5rem]", code: "text-[0.8125rem]" },
  md: { width: "w-36", park: "text-[0.5625rem]", code: "text-base" },
  lg: { width: "w-44", park: "text-[0.625rem]", code: "text-lg" },
};

export function TreeTag({
  code,
  size = "md",
  swing = false,
  className = "",
}: {
  code: string;
  size?: keyof typeof SIZES;
  swing?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div
      className={`${s.width} ${swing ? "origin-[50%_0.9375rem] animate-tag-swing" : ""} ${className}`}
    >
      <div className="metal relative rounded-[0.65rem] px-3 pb-2.5 pt-7 text-center">
        {/* the hole, with the nail through it */}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-2 size-3.5 -translate-x-1/2 rounded-full bg-[#59625b] shadow-[inset_0_1px_2px_rgb(0_0_0/0.5)]"
        />
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[0.6875rem] size-2 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#e3e7e4,#7b847d_70%)]"
        />
        <p
          className={`stamped font-mono font-bold uppercase leading-tight tracking-[0.16em] ${s.park}`}
        >
          Niah National Park
        </p>
        <svg
          viewBox={`-1 -1 ${QR_SIZE + 2} ${QR_SIZE + 2}`}
          aria-hidden="true"
          shapeRendering="crispEdges"
          className="mx-auto my-2 block w-full rounded-sm bg-[#eef1ed]"
        >
          <path d={qrPath(code)} fill="#26302a" />
        </svg>
        <p
          className={`stamped font-mono font-bold leading-none tracking-[0.06em] ${s.code}`}
        >
          {code}
        </p>
      </div>
    </div>
  );
}

/** A pencil sketch of a trunk with a real looking tag nailed to it */
export function TrunkWithTag({
  code,
  href,
  label,
}: {
  code: string;
  href: string;
  label: string;
}) {
  return (
    <div className="relative mx-auto h-[23rem] w-60">
      <svg
        viewBox="0 0 240 400"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full text-pencil"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
      >
        <path
          strokeWidth="1.8"
          d="M52 0C48 70 58 140 50 210S44 330 18 398M188 0c4 80-6 150 2 220s8 110 32 178"
        />
        <path
          strokeWidth="1.3"
          strokeOpacity="0.65"
          d="M76 8c3 30-3 60 1 92M100 34c-2 26 3 52-1 80M134 2c3 34-2 70 2 104M162 26c-3 30 2 56-2 86M70 236c2 30-2 60-8 96M98 262c-2 30 1 60-3 92M146 252c2 34-2 70 4 100M172 226c3 30 0 62 10 96"
        />
        <path
          strokeWidth="1.3"
          strokeOpacity="0.5"
          d="M0 396c40-6 80 4 120-2s80-6 120 0"
        />
      </svg>
      <Link
        href={href}
        aria-label={label}
        className="absolute left-1/2 top-14 block -translate-x-1/2 rounded-[0.7rem]"
      >
        <TreeTag code={code} size="lg" swing />
      </Link>
    </div>
  );
}
