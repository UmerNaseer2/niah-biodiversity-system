import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import type { IconName } from '@/constants/icons';
import { IUCN } from '@/lib/iucn';
import type { PublicSpecies } from '@/types/public-copy';

type Section = {
  title: string;
  icon: IconName;
  text: string;
};

const PROTECTED_NOTE =
  "It's also listed as a protected plant in Sarawak, under the Wild Life Protection " +
  'Ordinance 1998.';

/**
 * What the website's species page says about a species, in the same order. A species added on
 * the website has no habitat or uses yet, so a section with nothing in it is left out.
 */
export function SpeciesSections({ species }: { species: PublicSpecies }) {
  const sections: Section[] = [
    { title: 'About', icon: 'info', text: species.about },
    { title: 'Where it grows', icon: 'habitat', text: species.habitat },
    { title: 'How people use it', icon: 'people', text: species.uses },
  ];
  const status = IUCN[species.iucnCode];

  return (
    <>
      {sections
        .filter((section) => section.text.trim() !== '')
        .map((section) => (
          <Card key={section.title} title={section.title} icon={section.icon}>
            <ThemedText>{section.text.trim()}</ThemedText>
          </Card>
        ))}
      <Card title="Conservation status" icon="shield">
        <ThemedText>
          <ThemedText style={styles.bold}>{`${status.label} (${species.iucnCode})`}</ThemedText>
          {` on the IUCN Red List. ${status.meaning}`}
        </ThemedText>
        {species.sarawakProtected ? <ThemedText>{PROTECTED_NOTE}</ThemedText> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  bold: {
    fontWeight: 700,
  },
});
