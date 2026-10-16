/**
 * The IUCN codes the species table takes (supabase/001_initial_schema.sql).
 * DD is Data Deficient and NE is Not Evaluated. The table doesn't take Extinct
 * in the Wild (EW) or Extinct (EX), since the plants field teams record are
 * growing wild in the park.
 */
export const IUCN_CODES = ["LC", "NT", "VU", "EN", "CR", "DD", "NE"] as const;

export type IucnCode = (typeof IUCN_CODES)[number];

export function isIucnCode(value: unknown): value is IucnCode {
  return (
    typeof value === "string" &&
    (IUCN_CODES as readonly string[]).includes(value)
  );
}

/** The Red List scale, least to most at risk. DD and NE aren't on it. */
export const IUCN_ORDER = ["LC", "NT", "VU", "EN", "CR", "EW", "EX"] as const;

export const IUCN: Record<
  IucnCode,
  { label: string; threatened: boolean; meaning: string }
> = {
  LC: {
    label: "Least Concern",
    threatened: false,
    meaning: "It is widespread and not at risk right now.",
  },
  NT: {
    label: "Near Threatened",
    threatened: false,
    meaning: "It is close to being threatened, or likely to be soon.",
  },
  VU: {
    label: "Vulnerable",
    threatened: true,
    meaning: "It faces a high risk of dying out in the wild.",
  },
  EN: {
    label: "Endangered",
    threatened: true,
    meaning: "It faces a very high risk of dying out in the wild.",
  },
  CR: {
    label: "Critically Endangered",
    threatened: true,
    meaning: "It faces an extremely high risk of dying out in the wild.",
  },
  DD: {
    label: "Data Deficient",
    threatened: false,
    meaning:
      "There isn’t enough information yet to tell how at risk it is, so it isn’t on the scale yet.",
  },
  NE: {
    label: "Not Evaluated",
    threatened: false,
    meaning:
      "It hasn’t been checked against the Red List criteria yet, so it isn’t on the scale.",
  },
};

/**
 * Whether the public can see the exact spot of a plant. Only Least Concern and
 * Near Threatened species that aren't protected in Sarawak and aren't marked
 * rough area only. Every other plant only shows a rough area. It's the same
 * rule as the records_public view in supabase/007_species_fixes.sql.
 */
export function showsExactSpot(
  iucn: IucnCode,
  sarawakProtected: boolean,
  roughAreaOnly: boolean,
) {
  return (iucn === "LC" || iucn === "NT") && !sarawakProtected && !roughAreaOnly;
}
