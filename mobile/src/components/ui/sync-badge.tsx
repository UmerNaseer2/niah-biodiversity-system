import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Pill } from '@/components/ui/pill';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plural } from '@/lib/format';
import type { SyncStatus } from '@/types/plant-record';

/** Summary for the whole phone, shown at the top of Home. */
export function SyncBadge({ pending }: { pending: number }) {
  const theme = useTheme();
  const waiting = pending > 0;

  return (
    <View
      style={[styles.badge, { backgroundColor: waiting ? theme.warningSoft : theme.successSoft }]}>
      <Icon
        name={waiting ? 'pending' : 'synced'}
        size={18}
        color={waiting ? theme.warning : theme.success}
      />
      <ThemedText type="smallBold" themeColor={waiting ? 'warning' : 'success'}>
        {waiting ? `${plural(pending, 'record')} waiting to sync` : 'Everything is synced'}
      </ThemedText>
    </View>
  );
}

/** Tag for a single record in a list or on its page. */
export function SyncTag({ status }: { status: SyncStatus }) {
  return status === 'pending' ? (
    <Pill tone="warning" icon="pending" label="Pending sync" />
  ) : (
    <Pill tone="success" icon="synced" label="Synced" />
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
});
