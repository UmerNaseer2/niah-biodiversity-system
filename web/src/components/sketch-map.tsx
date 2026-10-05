import { GRID_DEG, PARK_HQ, type Area } from "@/lib/geo";
import { PlannedTape } from "./tape";

// A hand-drawn style map so the wireframe has something to point at. Real
// maps are item 20. The frame is lined up with the rough-area grid in
// lib/geo.ts, so a rough square always fills exactly one grid square.

const WEST_CELL = 28442; // 113.768°E
const NORTH_CELL = 956; // 3.824°N
const COLS = 5;
const ROWS = 4;
const SCALE = 100 / GRID_DEG; // map units per degree, one grid square is 100
const WIDTH = COLS * 100;
const HEIGHT = ROWS * 100;
const WEST = WEST_CELL * GRID_DEG;
const NORTH = NORTH_CELL * GRID_DEG;

const x = (lng: number) => (lng - WEST) * SCALE;
const y = (lat: number) => (NORTH - lat) * SCALE;

const halo = {
  paintOrder: "stroke",
  stroke: "#ffffff",
  strokeWidth: 4,
  strokeLinejoin: "round",
} as const;

export type MapPoint = { id: string; lat: number; lng: number; label: string };
export type MapArea = Area & { id: string };
export type MapSensor = {
  id: string;
  lat: number;
  lng: number;
  online: boolean;
  alert: boolean;
};

export function SketchMap({
  id,
  title,
  description,
  points = [],
  areas = [],
  sensors = [],
  planned,
  className = "",
}: {
  id: string;
  title: string;
  description: string;
  points?: MapPoint[];
  areas?: MapArea[];
  sensors?: MapSensor[];
  planned?: number[];
  className?: string;
}) {
  const hatchId = `${id}-hatch`;

  return (
    <figure className={className}>
      <div className="relative">
        <div className="overflow-hidden rounded-xl border border-line bg-sheet">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-labelledby={`${id}-title ${id}-desc`}
            className="block h-auto w-full"
          >
            <title id={`${id}-title`}>{title}</title>
            <desc id={`${id}-desc`}>{description}</desc>
            <defs>
              <pattern
                id={hatchId}
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="8" stroke="#5b6b60" strokeWidth="1.6" strokeOpacity="0.45" />
              </pattern>
            </defs>

            {/* grid, one square per rough area */}
            <g stroke="#dce3d6" strokeWidth="1">
              {Array.from({ length: COLS - 1 }, (_, i) => (
                <line key={`v${i}`} x1={(i + 1) * 100} y1="0" x2={(i + 1) * 100} y2={HEIGHT} />
              ))}
              {Array.from({ length: ROWS - 1 }, (_, i) => (
                <line key={`h${i}`} x1="0" y1={(i + 1) * 100} x2={WIDTH} y2={(i + 1) * 100} />
              ))}
            </g>
            <g fill="#7f8d83" fontSize="11" className="font-mono">
              {Array.from({ length: COLS - 1 }, (_, i) => (
                <text key={`lng${i}`} x={(i + 1) * 100 + 4} y="30">
                  {((WEST_CELL + i + 1) * GRID_DEG).toFixed(3)}°E
                </text>
              ))}
              {Array.from({ length: ROWS - 1 }, (_, i) => (
                <text key={`lat${i}`} x="4" y={(i + 1) * 100 - 5}>
                  {((NORTH_CELL - i - 1) * GRID_DEG).toFixed(3)}°N
                </text>
              ))}
            </g>

            {/* the river is drawn by hand, it is only there for orientation */}
            <path
              d="M-10 205C60 225 130 190 200 240S290 290 360 270 450 300 510 335"
              fill="none"
              stroke="#9cc3d5"
              strokeWidth="9"
              strokeLinecap="round"
              strokeOpacity="0.55"
            />
            <text x="452" y="296" fontSize="12" fill="#5b6b60" fontStyle="italic" textAnchor="middle" style={halo}>
              river (sketch)
            </text>

            {/* north arrow */}
            <g transform={`translate(${WIDTH - 24} 40)`} fill="#16201a">
              <path d="M0 -14 L6 4 L0 0 L-6 4 Z" />
              <text y="18" fontSize="12" fontWeight="700" textAnchor="middle">
                N
              </text>
            </g>

            {areas.map((area) => (
              <g key={area.id}>
                <rect
                  x={x(area.west)}
                  y={y(area.north)}
                  width={(area.east - area.west) * SCALE}
                  height={(area.north - area.south) * SCALE}
                  fill={`url(#${hatchId})`}
                  stroke="#5b6b60"
                  strokeWidth="2"
                  strokeDasharray="7 5"
                />
                <text
                  x={x(area.west) + 8}
                  y={y(area.north) + 20}
                  fontSize="13"
                  fontWeight="700"
                  fill="#16201a"
                  style={halo}
                >
                  Rough area
                </text>
              </g>
            ))}

            {/* park HQ */}
            <g transform={`translate(${x(PARK_HQ.lng)} ${y(PARK_HQ.lat)})`}>
              <path d="M-7 1L0-6 7 1V8H-7Z" fill="#16201a" stroke="#fff" strokeWidth="1.5" />
              <text x="-11" y="6" fontSize="13" fontWeight="700" fill="#16201a" textAnchor="end" style={halo}>
                Park HQ
              </text>
            </g>

            {sensors.map((sensor) => (
              <g key={sensor.id} transform={`translate(${x(sensor.lng)} ${y(sensor.lat)})`}>
                {sensor.alert && (
                  <circle r="13" fill="none" stroke="#b3261e" strokeWidth="2.5" />
                )}
                <rect
                  x="-5.5"
                  y="-5.5"
                  width="11"
                  height="11"
                  rx="1.5"
                  fill={sensor.online ? "#16201a" : "#ffffff"}
                  stroke="#16201a"
                  strokeWidth="2"
                />
                <text x="16" y="4.5" fontSize="12" fontWeight="700" fill="#16201a" className="font-mono" style={halo}>
                  {sensor.id}
                </text>
              </g>
            ))}

            {points.map((point) => (
              <g key={point.id} transform={`translate(${x(point.lng)} ${y(point.lat)})`}>
                <circle r="7" fill="#1f6b3a" stroke="#fff" strokeWidth="2.5" />
                <text x="12" y="5" fontSize="13" fontWeight="700" fill="#16201a" style={halo}>
                  {point.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
        {planned && (
          <PlannedTape
            items={planned}
            className="absolute left-3 top-0 -translate-y-1/2 -rotate-1"
          />
        )}
      </div>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-moss">
        {points.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="size-3 rounded-full border-2 border-white bg-forest ring-1 ring-forest" aria-hidden="true" />
            Tagged plant
          </span>
        )}
        {areas.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="hatch size-3.5 rounded-sm border border-dashed border-moss" aria-hidden="true" />
            Rough area
          </span>
        )}
        {sensors.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="size-3 rounded-sm bg-ink" aria-hidden="true" />
            Sensor
          </span>
        )}
        {sensors.some((s) => !s.online) && (
          <span className="inline-flex items-center gap-2">
            <span className="size-3 rounded-sm border-2 border-ink bg-sheet" aria-hidden="true" />
            Offline
          </span>
        )}
        {sensors.some((s) => s.alert) && (
          <span className="inline-flex items-center gap-2">
            <span className="size-3.5 rounded-full border-2 border-bad" aria-hidden="true" />
            Has an alert
          </span>
        )}
        <span>Each grid square is about 440 m across.</span>
      </figcaption>
    </figure>
  );
}
