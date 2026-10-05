"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import {
  HiddenLocationBadge,
  IucnChip,
  LatinName,
  PhotoPlaceholder,
  ProtectedBadge,
} from "@/components/plant-bits";
import { plural } from "@/lib/format";
import type { IucnCode } from "@/lib/iucn";

export type PlantSummary = {
  slug: string;
  name: string;
  otherNames: string[];
  scientificName: string;
  newerName: string | null;
  family: string;
  iucn: IucnCode;
  threatened: boolean;
  sarawakProtected: boolean;
  hidesLocation: boolean;
  tagged: number;
};

type Filter = "all" | "threatened" | "not-threatened";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "threatened", label: "Threatened" },
  { value: "not-threatened", label: "Not threatened" },
];

function matches(plant: PlantSummary, words: string[]) {
  const text = [
    plant.name,
    ...plant.otherNames,
    plant.scientificName,
    plant.newerName ?? "",
    plant.family,
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

export function PlantSearch({
  plants,
  initialQuery,
}: {
  plants: PlantSummary[];
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [focusRequest, setFocusRequest] = useState<{
    elementId: string;
  } | null>(null);

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.elementId)?.focus();
  }, [focusRequest]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = plants.filter(
    (plant) =>
      matches(plant, words) &&
      (filter === "all" || (filter === "threatened") === plant.threatened),
  );

  // Keep ?q= in the address bar so a search can be shared or reloaded
  function changeQuery(next: string) {
    setQuery(next);
    const url = new URL(window.location.href);
    if (next.trim()) url.searchParams.set("q", next.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  function clearSearch() {
    changeQuery("");
    setFilter("all");
    setFocusRequest({ elementId: "plant-search" });
  }

  let status = `Showing all ${plural(plants.length, "plant")}`;
  if (shown.length === 0) status = "No plants match";
  else if (shown.length < plants.length) {
    status = `Showing ${shown.length} of ${plural(plants.length, "plant")}`;
  }

  return (
    <div className="mt-8">
      <div role="search" className="flex flex-col gap-4">
        <div>
          <label htmlFor="plant-search" className="font-bold">
            Search plants
          </label>
          <div className="relative mt-2">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-pencil"
            />
            <input
              id="plant-search"
              type="search"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              autoComplete="off"
              placeholder="Belian, Nepenthes, Dipterocarpaceae…"
              className="field pl-10"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Conservation status"
            className="flex flex-wrap gap-2"
          >
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className="min-h-10 rounded-full border border-line bg-sheet px-4 text-sm font-bold text-moss transition-colors hover:border-pencil aria-pressed:border-forest aria-pressed:bg-forest aria-pressed:text-white"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p role="status" className="text-sm text-moss">
            {status}
          </p>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center px-6 py-12 text-center">
          <Icon name="search" className="size-8 text-pencil" />
          <p className="mt-3 text-lg font-bold">
            {query.trim()
              ? `Nothing matches “${query.trim()}”`
              : "No plants match this filter"}
          </p>
          <p className="mt-1 max-w-sm text-moss">
            Check the spelling, or try the Latin name or the family instead.
          </p>
          <button
            type="button"
            onClick={clearSearch}
            className="btn btn-secondary mt-5"
          >
            Clear search
          </button>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {shown.map((plant) => (
            <li key={plant.slug}>
              <Link
                href={`/plants/${plant.slug}`}
                className="card group flex gap-4 p-3 transition-colors hover:border-pencil sm:p-4"
              >
                <PhotoPlaceholder
                  showIcon={false}
                  className="size-20 shrink-0 sm:size-24"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h2 className="text-lg font-bold group-hover:underline">
                      {plant.name}
                    </h2>
                    <p className="font-mono text-xs text-moss">
                      {plant.tagged > 0
                        ? plural(plant.tagged, "tagged plant")
                        : "None public yet"}
                    </p>
                  </div>
                  <p className="text-moss">
                    <LatinName name={plant.scientificName} /> · {plant.family}
                  </p>
                  {plant.otherNames.length > 0 && (
                    <p className="text-sm text-moss">
                      Also called {plant.otherNames.join(", ")}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <IucnChip code={plant.iucn} />
                    {plant.sarawakProtected && <ProtectedBadge />}
                    {plant.hidesLocation && <HiddenLocationBadge />}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
