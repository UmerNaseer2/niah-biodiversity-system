import { LeafletMap, type MapArea, type MapPoint, type MapSensor } from "./leaflet-map";
import { PlannedTape } from "./tape";

export type { MapArea, MapPoint, MapSensor };

/**
 * A map of the park with a legend under it (item 20). Pages build the points
 * on the server, so for a species whose spot is hidden they pass rough
 * squares from lib/geo.ts and never the points, and the exact spot never
 * reaches the browser.
 */
export function ParkMap({
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
  return (
    <figure className={className}>
      <div className="relative">
        <LeafletMap
          title={title}
          descriptionId={`${id}-desc`}
          points={points}
          areas={areas}
          sensors={sensors}
        />
        {planned && (
          <PlannedTape
            items={planned}
            className="absolute left-3 top-0 z-20 -translate-y-1/2 -rotate-1"
          />
        )}
      </div>
      <p id={`${id}-desc`} className="sr-only">
        {description}
      </p>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-moss">
        {points.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="size-3 rounded-full border-2 border-white bg-forest ring-1 ring-forest" aria-hidden="true" />
            Tagged plant
          </span>
        )}
        {areas.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="size-3.5 rounded-sm border-2 border-dashed border-moss bg-moss/20" aria-hidden="true" />
            Rough area, about 440 m across
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
        <span className="inline-flex items-center gap-2">
          <svg viewBox="-9 -8 18 18" className="size-3.5" aria-hidden="true">
            <path d="M-7 1L0-6 7 1V8H-7Z" className="fill-ink" />
          </svg>
          Park HQ
        </span>
      </figcaption>
    </figure>
  );
}
