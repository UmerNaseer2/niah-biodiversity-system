import type { IucnCode } from '@/types/public-copy';

// The same words and colours as the public website (web/src/lib/iucn.ts and the IucnChip in
// web/src/components/plant-bits.tsx), so a plant reads the same on the phone as on the web.

/** What each Red List status is called, and what it means for the plant, in plain words. */
export const IUCN: Record<IucnCode, { label: string; meaning: string }> = {
  LC: {
    label: 'Least Concern',
    meaning: 'It is widespread and not at risk right now.',
  },
  NT: {
    label: 'Near Threatened',
    meaning: 'It is close to being threatened, or likely to be soon.',
  },
  VU: {
    label: 'Vulnerable',
    meaning: 'It faces a high risk of dying out in the wild.',
  },
  EN: {
    label: 'Endangered',
    meaning: 'It faces a very high risk of dying out in the wild.',
  },
  CR: {
    label: 'Critically Endangered',
    meaning: 'It faces an extremely high risk of dying out in the wild.',
  },
  DD: {
    label: 'Data Deficient',
    meaning:
      "There isn't enough information yet to tell how at risk it is, so it isn't on the scale yet.",
  },
  NE: {
    label: 'Not Evaluated',
    meaning: "It hasn't been checked against the Red List criteria yet, so it isn't on the scale.",
  },
};

type Swatch = {
  background: string;
  text: string;
  /** Not Evaluated is white, so it needs an edge to show up on a white card. */
  outlined?: boolean;
};

/** Red List colours. They stay the same in dark mode, since they're the Red List's own colours. */
export const IUCN_SWATCH: Record<IucnCode, Swatch> = {
  LC: { background: '#60C659', text: '#16201A' },
  NT: { background: '#CCE226', text: '#16201A' },
  VU: { background: '#F9E814', text: '#16201A' },
  EN: { background: '#FC7F3F', text: '#16201A' },
  CR: { background: '#D81E05', text: '#FFFFFF' },
  DD: { background: '#D1D1C6', text: '#16201A' },
  NE: { background: '#FFFFFF', text: '#16201A', outlined: true },
};

/** Vulnerable, Endangered or Critically Endangered, like the website's Threatened filter. */
export function isThreatened(code: IucnCode) {
  return code === 'VU' || code === 'EN' || code === 'CR';
}
