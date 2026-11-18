import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { conditionLabel, formatRecordedAt } from '@/lib/format';
import { firstRecordId, plantHistory } from '@/lib/visits';
import { useRecords } from '@/state/records-context';
import type { PlantRecord } from '@/types/plant-record';

/**
 * The plant's first record and every visit to it that's saved on this phone, newest first. It
 * only reads what's on the phone, so it works with no signal. Add a visit opens the form for a new
 * record about the same plant, so the old records stay the way they were.
 */
export function PlantHistory({ record }: { record: PlantRecord }) {
  const router = useRouter();
  const theme = useTheme();
  const { records, mode } = useRecords();
  const history = plantHistory(records, record);
  const firstId = firstRecordId(record);

  return (
    <Card title="History" icon="history">
      {history.length < 2 ? (
        <ThemedText themeColor="textSecondary">
          No visits to this plant on this phone yet. Add one each time you check on it.
        </ThemedText>
      ) : null}
      <View style={styles.list}>
        {history.map((one) => {
          const kind = one.id === firstId ? 'First record' : 'Visit';
          const date = formatRecordedAt(one.recordedAt);
          const condition = conditionLabel(one.condition);
          const current = one.id === record.id;
          const body = (
            <>
              <View style={styles.text}>
                <ThemedText type="smallBold">{date}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {current ? `${kind}, ${condition}, open now` : `${kind}, ${condition}`}
                </ThemedText>
              </View>
              {current ? null : <Icon name="chevron" size={16} color={theme.textSecondary} />}
            </>
          );

          if (current) {
            return (
              <View
                key={one.id}
                style={[
                  styles.row,
                  { borderColor: theme.primary, backgroundColor: theme.primarySoft },
                ]}>
                {body}
              </View>
            );
          }
          return (
            <Pressable
              key={one.id}
              role="button"
              aria-label={`Open the ${kind.toLowerCase()} from ${date}, ${condition}`}
              onPress={() => router.push({ pathname: '/record/[id]', params: { id: one.id } })}
              style={({ pressed }) => [
                styles.row,
                { borderColor: theme.border },
                pressed && styles.pressed,
              ]}>
              {body}
            </Pressable>
          );
        })}
      </View>
      {/* Visitors don't make records, so they don't get the form either. dismissTo goes back to
          the tabs that are already open. navigate would stack a second copy of them on top. */}
      {mode === 'visitor' ? null : (
        <Button
          label="Add a visit"
          icon="newRecord"
          onPress={() =>
            router.dismissTo({ pathname: '/new-record', params: { visitOf: firstId } })
          }
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.8,
  },
});
