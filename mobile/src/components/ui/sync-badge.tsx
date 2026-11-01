import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Pill } from '@/components/ui/pill';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plural } from '@/lib/format';
import type { ReviewStatus, SyncStatus, UploadProblem } from '@/types/plant-record';

/** Summary for the whole phone, shown at the top of Home. */
export function SyncBadge({
  pending,
  total,
  photos = 0,
}: {
  pending: number;
  total: number;
  /** Photos of records already on the server that aren't up yet. */
  photos?: number;
}) {
  const theme = useTheme();
  const waiting = pending > 0 || photos > 0;

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
        {pending > 0
          ? `${plural(pending, 'record')} waiting to sync`
          : photos > 0
            ? `${plural(photos, 'photo')} not uploaded`
            : 'Everything is synced'}
      </ThemedText>
    </View>
  );
}

type SyncBannerProps = {
  waiting: number;
  problems: number;
  /** Photos that go up on their own, because the account that sent their records is signed in. */
  photosWaiting?: number;
  /** Photos waiting for the account that sent their records to sign in. */
  photosHeld?: number;
  /** Photos that can't go up until someone does something about them. */
  photoProblems?: number;
  signedIn?: boolean;
  syncing?: boolean;
  /** What the last sync came to, if there's anything to say about it. */
  message?: string | null;
  onSync?: () => void;
  onSignIn?: () => void;
};

/**
 * Banner at the top of My records while anything is still on the phone only. Records with an
 * upload problem are counted apart from the rest, because waiting for signal won't send them.
 * Shows nothing when every count is 0 and the last sync has nothing to say.
 */
export function SyncBanner({
  waiting,
  problems,
  photosWaiting = 0,
  photosHeld = 0,
  photoProblems = 0,
  signedIn = false,
  syncing = false,
  message,
  onSync,
  onSignIn,
}: SyncBannerProps) {
  const theme = useTheme();
  const photos = photosWaiting + photosHeld;
  if (waiting === 0 && problems === 0 && photos === 0 && photoProblems === 0) {
    // The last record just went up, so this is the only place left to say so.
    return message ? (
      <View style={[styles.banner, { backgroundColor: theme.successSoft }]}>
        <ThemedText type="small" themeColor="success">
          {message}
        </ThemedText>
      </View>
    ) : null;
  }

  const one = problems === 1;
  // Only problem records are left, so the banner is about them.
  const onlyProblems = waiting === 0 && problems > 0;
  // Right after a sync the message can already say these. Saying it twice reads like a second
  // problem, and "also" would be wrong because it's the same record.
  const recordsInMessage = message?.includes(`${plural(problems, 'record')} couldn't upload`);
  const photoProblemText = `${plural(photoProblems, 'photo')} couldn't upload. Open ${photoProblems === 1 ? 'its record' : 'their records'} to see why.`;
  const tone = onlyProblems ? 'danger' : 'warning';
  let title = `${plural(waiting, 'record')} waiting to sync`;
  if (onlyProblems) {
    title = `${plural(problems, 'record')} couldn't upload`;
  } else if (waiting === 0) {
    title =
      photos > 0
        ? `${plural(photos, 'photo')} waiting to upload`
        : `${plural(photoProblems, 'photo')} couldn't upload`;
  }

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
      {waiting === 0 ? null : (
        <ThemedText type="small" themeColor="warning">
          {waiting === 1 ? 'It is' : 'They are'} saved on this phone and safe to leave.{' '}
          {signedIn
            ? `${waiting === 1 ? 'It goes' : 'They go'} up on ${waiting === 1 ? 'its' : 'their'} own when you have signal.`
            : `Sign in and ${waiting === 1 ? 'it goes' : 'they go'} up when you have signal.`}
        </ThemedText>
      )}
      {problems > 0 && (onlyProblems || !recordsInMessage) ? (
        <ThemedText type="small" themeColor={tone}>
          {onlyProblems
            ? `${one ? 'It is' : 'They are'} still saved on this phone. `
            : `${plural(problems, 'record')} also couldn't upload last time. `}
          Open {one ? 'it' : 'them'} to see why, and press Sync now once {one ? "it's" : "they're"}{' '}
          sorted out.
        </ThemedText>
      ) : null}
      {photosWaiting > 0 ? (
        <ThemedText type="small" themeColor={tone}>
          {plural(photosWaiting, 'photo')} {photosWaiting === 1 ? 'goes' : 'go'} up on{' '}
          {photosWaiting === 1 ? 'its' : 'their'} own when you have signal.
        </ThemedText>
      ) : null}
      {photosHeld > 0 ? (
        <ThemedText type="small" themeColor={tone}>
          {plural(photosHeld, 'photo')} {photosHeld === 1 ? 'waits' : 'wait'} for the account that
          sent {photosHeld === 1 ? 'its record' : 'their records'} to sign in.
        </ThemedText>
      ) : null}
      {photoProblems > 0 && !message?.includes(photoProblemText) ? (
        <ThemedText type="small" themeColor={tone}>
          {photoProblemText}
        </ThemedText>
      ) : null}
      {message ? (
        <ThemedText type="small" themeColor={tone}>
          {message}
        </ThemedText>
      ) : null}
      {signedIn ? (
        <Button
          label={syncing ? 'Syncing...' : 'Sync now'}
          icon="sync"
          variant="outline"
          disabled={syncing}
          onPress={onSync}
        />
      ) : (
        <Button label="Sign in to sync" icon="login" variant="outline" onPress={onSignIn} />
      )}
    </View>
  );
}

/** The words for where a record has got to. The tag shows them and a screen reader reads them. */
export function syncTagLabel(
  status: SyncStatus,
  problem?: UploadProblem,
  review?: ReviewStatus,
): string {
  if (problem) {
    return "Couldn't upload";
  }
  if (status === 'pending') {
    return 'Pending sync';
  }
  if (review === 'rejected') {
    return 'Rejected';
  }
  return review === 'published' ? 'Approved' : 'Synced';
}

/** Tag for a single record in a list or on its page. */
export function SyncTag({
  status,
  problem,
  review,
}: {
  status: SyncStatus;
  problem?: UploadProblem;
  review?: ReviewStatus;
}) {
  const label = syncTagLabel(status, problem, review);
  // A problem means it's still waiting, but it won't go up until someone sorts it out. A rejection
  // means an officer turned it down. The record's page says what to do about either.
  if (problem || (status === 'synced' && review === 'rejected')) {
    return <Pill tone="danger" icon="warning" label={label} />;
  }
  return status === 'pending' ? (
    <Pill tone="warning" icon="pending" label={label} />
  ) : (
    <Pill tone="success" icon="synced" label={label} />
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
