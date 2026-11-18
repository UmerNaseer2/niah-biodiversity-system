import Link from "next/link";
import {
  DIDNT_LOAD_TEXT,
  MAYBE_MORE_TEXT,
  NEARBY_RADIUS_M,
  NONE_NEAR_TEXT,
  NO_POSITION_TEXT,
  type NearbyPlants,
} from "@/lib/nearby-plants";

// The tagged plants near a node. Both a node card and an alert show it, and the alert list is a
// client component, so this has nothing that only works on the server.
export function NearbyPlantList({ nearby }: { nearby: NearbyPlants }) {
  if (nearby.kind === "no-position") {
    return <p className="text-sm text-moss">{NO_POSITION_TEXT}</p>;
  }
  if (nearby.kind === "failed") {
    return <p className="text-sm font-bold text-bad">{DIDNT_LOAD_TEXT}</p>;
  }
  if (nearby.plants.length === 0) {
    return <p className="text-sm text-moss">{NONE_NEAR_TEXT}</p>;
  }
  return (
    <>
      <ul className="space-y-1 text-sm">
        {nearby.plants.map((plant) => (
          <li key={plant.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link
              href={`/dashboard/records/${plant.id}/edit`}
              className="font-bold text-forest underline-offset-2 hover:underline"
            >
              <span className="italic">{plant.speciesName}</span>
              {plant.commonName && <span className="font-normal not-italic text-ink"> ({plant.commonName})</span>}
            </Link>
            <span className="font-mono text-xs">{plant.tagCode}</span>
            <span className="text-moss">{plant.distanceM} m away</span>
            {plant.waiting && (
              <span className="rounded-full border border-line bg-paper px-2 py-px text-xs font-bold text-moss">
                Waiting for review
              </span>
            )}
          </li>
        ))}
      </ul>
      {nearby.maybeMore && <p className="mt-1 text-xs text-moss">{MAYBE_MORE_TEXT}</p>}
    </>
  );
}

/** The heading line, so a card and an alert say the same thing */
export const NEARBY_HEADING = `Tagged plants within ${NEARBY_RADIUS_M} m`;
