export type IucnCode = "LC" | "NT" | "VU" | "EN" | "CR" | "EW" | "EX";

/** Least to most at risk, the order the Red List uses */
export const IUCN_ORDER: IucnCode[] = ["LC", "NT", "VU", "EN", "CR", "EW", "EX"];

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
  EW: {
    label: "Extinct in the Wild",
    threatened: false,
    meaning: "It only survives in gardens or collections.",
  },
  EX: {
    label: "Extinct",
    threatened: false,
    meaning: "None are left anywhere.",
  },
};
