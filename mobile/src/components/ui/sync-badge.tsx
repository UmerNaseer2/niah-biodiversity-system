import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Pill } from '@/components/ui/pill';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plural } from '@/lib/format';
import type { SyncStatus, UploadProblem } from '@/types/plant-record';

/** Summary for the whole phone, shown at the top of Home. */
export function SyncBadge({ pending, total }: { pending: number; total: number }) {
  const theme = useTheme();
  const waiting = pending > 0;

  if (total === 0) {
    // Nothing has been saved yet, so "Everything is synced" would be true but misleading.
    return (
      <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
        <Icon name="leaf" size={18} color={theme.primary} />
        <ThemedText type="smallBold" themeColor="primary">
          No records yet
        </ThemedText>
      </View>
    );
  }

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

/**
 * Banner at the top of My records while anything is still on the phone only. Records with an
 * upload problem are counted apart from the rest, because waiting for signal won't send them.
 * Shows nothing when both counts are 0.
 */
export function SyncBanner({ waiting, problems }: { waiting: number; problems: number }) {
  const theme = useTheme();
  if (waiting === 0 && problems === 0) {
    return null;
  }

  const one = problems === 1;
  const sortedOut = one ? 'it is sorted out' : 'they are sorted out';
  // Only problem records are left, so the banner is about them and Sync now wouldn't help.
  const onlyProblems = waiting === 0;
  const tone = onlyProblems ? 'danger' : 'warning';
  const title = onlyProblems
    ? `${plural(problems, 'record')} couldn't upload`
    : `${plural(waiting, 'record')} waiting to sync`;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: onlyProblems ? theme.dangerSoft : theme.warningSoft },
      ]}>
      <View style={styles.bannerTitle}>
        <Icon name={onlyProblems ? 'warning' : 'pending'} size={20} color={theme[tone]} />
        <ThemedText type="heading" themeColor={tone} role="heading" style={styles.flex}>
          {title}
        </ThemedText>
      </View>
      {onlyProblems ? null : (
        <ThemedText type="small" themeColor="warning">
          {waiting === 1 ? 'It is' : 'They are'} saved on this phone and safe to leave until you
          have signal. Uploading comes in item 10.
        </ThemedText>
      )}
      {problems > 0 ? (
        <ThemedText type="small" themeColor={tone}>
          {onlyProblems
            ? `${one ? 'It is' : 'They are'} still saved on this phone, but `
            : `${plural(problems, 'record')} also couldn't upload last time and `}
          won&apos;t go up until {sortedOut}. Open {one ? 'it' : 'them'} to see why.
        </ThemedText>
      ) : null}
      {onlyProblems ? null : <Button label="Sync now" icon="sync" variant="outline" disabled />}
    </View>
  );
}

/** Tag for a single record in a list or on its page. */
export function SyncTag({ status, problem }: { status: SyncStatus; problem?: UploadProblem }) {
  if (problem) {
    // Still waiting, but it won't go up until someone sorts it out. The record's page says how.
    return <Pill tone="danger" icon="warning" label="Couldn't upload" />;
  }
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
  banner: {
    gap: 12,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  bannerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});
