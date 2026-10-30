"use client";

import "leaflet/dist/leaflet.css";
import type {
  CircleMarker,
  LatLngTuple,
  Map as LeafletMapType,
  Marker,
  Tooltip,
} from "leaflet";
import { useEffect, useRef, useState } from "react";
import { PARK_HQ, type Area } from "@/lib/geo";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  // Where the dot goes when it's clicked, and what a screen reader says for it
  link?: { href: string; text: string };
};
export type MapArea = Area & { id: string };
export type MapSensor = {
  id: string;
  lat: number;
  lng: number;
  online: boolean;
  alert: boolean;
};

// The same colours as globals.css. Leaflet writes them onto the SVG as
// attributes, and attributes can't read CSS variables.
const FOREST = "#1f6b3a";
const MOSS = "#5b6b60";

const HQ_ICON =
  '<svg viewBox="-9 -8 18 18" width="18" height="18" aria-hidden="true"><path d="M-7 1L0-6 7 1V8H-7Z" fill="#16201a" stroke="#fff" stroke-width="1.5"/></svg>';

// Labels come from the database, so they go in as text and never as HTML
function label(text: string, mono = false) {
  const span = document.createElement("span");
  span.textContent = text;
  if (mono) span.className = "font-mono";
  return span;
}

/**
 * The map itself, drawn with Leaflet on OpenStreetMap tiles. Leaflet needs
 * the browser, so it is loaded after the page has rendered. It only draws
 * what it is given: for a hidden species the server sends rough squares and
 * never the points inside them (see ParkMap).
 */
export function LeafletMap({
  title,
  descriptionId,
  points,
  areas,
  sensors,
}: {
  title: string;
  descriptionId: string;
  points: MapPoint[];
  areas: MapArea[];
  sensors: MapSensor[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let map: LeafletMapType | undefined;
    let cancelled = false;

    import("leaflet")
      .then((L) => {
        if (cancelled) return;
        map = L.map(element, {
          // Scrolling the page shouldn't zoom the map. The buttons still do.
          scrollWheelZoom: false,
          maxZoom: 18,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const corners: LatLngTuple[] = [[PARK_HQ.lat, PARK_HQ.lng]];

        // Every label, with the dot it belongs to if it has one. Plants come
        // first when two labels want the same space, then park HQ, sensors
        // and rough areas. Leaflet only draws a dot once the map has a view,
        // so it's looked up each time instead of kept here.
        const labels: {
          rank: number;
          tooltip: Tooltip;
          layer?: Marker | CircleMarker;
        }[] = [];
        const remember = (rank: number, layer: Marker | CircleMarker) => {
          const tooltip = layer.getTooltip();
          if (tooltip) labels.push({ rank, tooltip, layer });
        };
        // The labels of the dot under the pointer and the dot with focus.
        // They always show, and the others make room for them.
        let pointed: Tooltip | undefined;
        let focused: Tooltip | undefined;
        const featured = (tooltip: Tooltip) =>
          tooltip === pointed || tooltip === focused;

        // Plants close together would have their labels on top of each other
        // and on top of the dots, so a label that would cover another label or
        // another dot is hidden until zooming in makes room for it.
        const declutter = () => {
          const dots = new Map(
            labels.map((item) => [
              item,
              item.layer?.getElement()?.getBoundingClientRect(),
            ]),
          );
          const kept: DOMRect[] = [];
          const order = [...labels].sort(
            (a, b) => Number(featured(b.tooltip)) - Number(featured(a.tooltip)),
          );
          for (const item of order) {
            const element = item.tooltip.getElement();
            if (!element) continue;
            // The line is a little taller than the letters, so a label can
            // touch something above or below it by 2 pixels
            const line = element.getBoundingClientRect();
            const box = new DOMRect(
              line.x,
              line.y + 2,
              line.width,
              line.height - 4,
            );
            const covers = (other?: DOMRect) =>
              other !== undefined &&
              box.left < other.right &&
              other.left < box.right &&
              box.top < other.bottom &&
              other.top < box.bottom;
            const hidden =
              !featured(item.tooltip) &&
              (kept.some(covers) ||
                labels.some(
                  (other) => other !== item && covers(dots.get(other)),
                ));
            element.classList.toggle("map-label-hidden", hidden);
            if (!hidden) kept.push(box);
          }
        };

        // The map can be dragged by a dot too. A dot moves with the map, so a
        // drag that starts on one ends on it, and that shouldn't open the link.
        let dragged = false;
        map.on("dragstart", () => {
          dragged = true;
        });

        for (const area of areas) {
          const bounds: [LatLngTuple, LatLngTuple] = [
            [area.south, area.west],
            [area.north, area.east],
          ];
          corners.push(...bounds);
          L.rectangle(bounds, {
            color: MOSS,
            weight: 2,
            dashArray: "7 5",
            fillColor: MOSS,
            fillOpacity: 0.2,
            interactive: false,
          }).addTo(map);
          // In the top left corner, like the sketch maps had it, so it stays
          // clear of a dot or park HQ in the middle
          const tooltip = L.tooltip({
            permanent: true,
            direction: "right",
            offset: [2, 12],
            className: "map-label",
          })
            .setLatLng([area.north, area.west])
            .setContent(label("Rough area"))
            .addTo(map);
          labels.push({ rank: 3, tooltip });
        }

        const hq = L.marker([PARK_HQ.lat, PARK_HQ.lng], {
          icon: L.divIcon({ html: HQ_ICON, className: "", iconSize: [18, 18] }),
          interactive: false,
          keyboard: false,
        })
          .bindTooltip(label("Park HQ"), {
            permanent: true,
            direction: "left",
            offset: [-8, 0],
            className: "map-label",
          })
          .addTo(map);
        remember(1, hq);

        for (const sensor of sensors) {
          corners.push([sensor.lat, sensor.lng]);
          const marker = L.marker([sensor.lat, sensor.lng], {
            icon: L.divIcon({
              html: "<span></span>",
              className: [
                "map-sensor",
                sensor.online ? "" : "map-sensor-offline",
                sensor.alert ? "map-sensor-alert" : "",
              ].join(" "),
              iconSize: [14, 14],
            }),
            interactive: false,
            keyboard: false,
          })
            .bindTooltip(label(sensor.id, true), {
              permanent: true,
              direction: "right",
              offset: [10, 0],
              className: "map-label",
            })
            .addTo(map);
          remember(2, marker);
        }

        for (const point of points) {
          const at: LatLngTuple = [point.lat, point.lng];
          corners.push(at);
          if (!point.link) {
            const dot = L.circleMarker(at, {
              radius: 7,
              color: "#ffffff",
              weight: 2.5,
              fillColor: FOREST,
              fillOpacity: 1,
              interactive: false,
            })
              .bindTooltip(label(point.label), {
                permanent: true,
                direction: "right",
                offset: [8, 0],
                className: "map-label",
              })
              .addTo(map);
            remember(0, dot);
            continue;
          }

          // A dot with somewhere to go is a real link, so it can be tabbed to
          // and opened with the keyboard as well as clicked
          const link = document.createElement("a");
          link.href = point.link.href;
          link.className = "map-dot";
          const name = label(point.link.text);
          name.className = "sr-only";
          link.append(name);
          // Tabbing to a dot that's been panned out of sight brings it back
          link.addEventListener("focus", () => {
            if (map && !map.getBounds().contains(at)) map.panTo(at);
          });
          link.addEventListener("pointerdown", () => {
            dragged = false;
          });
          link.addEventListener("click", (event) => {
            // Enter gives a click with no pointer (detail 0), so it always opens
            if (dragged && event.detail > 0) event.preventDefault();
          });
          // The link already says it, so screen readers don't hear it twice
          const shown = label(point.label);
          shown.setAttribute("aria-hidden", "true");
          const marker = L.marker(at, {
            icon: L.divIcon({ html: link, className: "", iconSize: [24, 24] }),
            interactive: false,
            keyboard: false,
          })
            .bindTooltip(shown, {
              permanent: true,
              direction: "right",
              offset: [10, 0],
              className: "map-label",
            })
            .addTo(map);
          remember(0, marker);

          // Pointing at a dot or tabbing to it shows its label, even if
          // another one was in the way
          const tooltip = marker.getTooltip();
          link.addEventListener("focus", () => {
            focused = tooltip;
            declutter();
          });
          link.addEventListener("blur", () => {
            if (focused === tooltip) focused = undefined;
            declutter();
          });
          link.addEventListener("pointerenter", () => {
            pointed = tooltip;
            declutter();
          });
          link.addEventListener("pointerleave", () => {
            if (pointed === tooltip) pointed = undefined;
            declutter();
          });
        }

        labels.sort((a, b) => a.rank - b.rank);
        // fitBounds fires zoomend, so this runs once the map is first drawn too
        map.on("zoomend resize", declutter);
        // A label gets wider when the web font arrives
        document.fonts.ready.then(() => {
          if (!cancelled) declutter();
        });

        map.fitBounds(L.latLngBounds(corners), { padding: [48, 48], maxZoom: 15 });
        setState("ready");
      })
      .catch((error) => {
        console.error("The map didn't load:", error);
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, areas, sensors]);

  return (
    <div className="map-frame relative isolate h-80 overflow-hidden rounded-xl border border-line bg-sheet sm:h-96">
      {/* Leaflet owns everything inside this box, so React never renders into it */}
      <div
        ref={box}
        role="region"
        aria-label={title}
        aria-describedby={descriptionId}
        className="h-full w-full"
      />
      {state !== "ready" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-sheet p-6 text-center text-sm text-moss">
          {state === "loading" ? (
            // Without JavaScript, ParkMap shows StaticMap on top of this
            <span aria-hidden="true">Loading the map…</span>
          ) : (
            <p role="alert">
              The map didn’t load. Check your connection and refresh the page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
