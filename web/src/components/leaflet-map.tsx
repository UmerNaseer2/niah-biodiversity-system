"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngTuple, Map as LeafletMapType } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { PARK_HQ, type Area } from "@/lib/geo";

export type MapPoint = { id: string; lat: number; lng: number; label: string };
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
          L.tooltip({
            permanent: true,
            direction: "right",
            offset: [2, 12],
            className: "map-label",
          })
            .setLatLng([area.north, area.west])
            .setContent(label("Rough area"))
            .addTo(map);
        }

        L.marker([PARK_HQ.lat, PARK_HQ.lng], {
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

        for (const sensor of sensors) {
          corners.push([sensor.lat, sensor.lng]);
          L.marker([sensor.lat, sensor.lng], {
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
        }

        for (const point of points) {
          corners.push([point.lat, point.lng]);
          L.circleMarker([point.lat, point.lng], {
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
        }

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
            <>
              <span aria-hidden="true">Loading the map…</span>
              <noscript>The map needs JavaScript turned on.</noscript>
            </>
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
