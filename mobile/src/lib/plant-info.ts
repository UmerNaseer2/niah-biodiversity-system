import type { PublicRecord, PublicSpecies } from '@/types/public-copy';

/** The species a tagged plant belongs to, if the field team matched it to one on the list. */
export function speciesOf(record: PublicRecord, species: readonly PublicSpecies[]) {
  return record.speciesSlug === undefined
    ? undefined
    : species.find((item) => item.slug === record.speciesSlug);
}

/** The name a visitor would know the plant by. The website's tag page picks it the same way. */
export function plantName(record: PublicRecord, species?: PublicSpecies) {
  return species?.commonNames[0] ?? record.commonName ?? record.speciesName;
}

/** Without a common name a plant goes by its Latin name, which is written in italics. */
export function hasCommonName(record: PublicRecord, species?: PublicSpecies) {
  return (species?.commonNames[0] ?? record.commonName) !== undefined;
}
