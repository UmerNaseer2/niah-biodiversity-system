import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { InfoRow } from '@/components/ui/info-row';
import { PlaceholderNote } from '@/components/ui/placeholder-note';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRecords } from '@/state/records-context';

export default function ProfileScreen() {
  const theme = useTheme();
  const { records, pendingCount } = useRecords();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen title="Profile">
      <Card>
        <View style={styles.account}>
          <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
            <Icon name="profile" size={32} color={theme.primary} />
          </View>
          <View style={styles.accountText}>
            <ThemedText type="heading">Not signed in</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Sign in so your records are linked to you when they sync.
            </ThemedText>
          </View>
        </View>
        <Button label="Sign in" icon="login" disabled />
        <PlaceholderNote item={2}>
          Sign in with Supabase Auth. The roles from item 4 then decide what each person can see
          and do.
        </PlaceholderNote>
      </Card>

      <Card title="This phone" icon="phone">
        <InfoRow label="Records on this phone" value={String(records.length)} />
        <InfoRow label="Waiting to sync" value={String(pendingCount)} />
        <InfoRow label="Synced" value={String(records.length - pendingCount)} />
      </Card>

      <Card title="About" icon="info">
        <InfoRow label="App" value="Niah Ground-Truthing" />
        <InfoRow label="Version" value={version} />
        <ThemedText type="small" themeColor="textSecondary">
          COS30049 student project for Sarawak Forestry Corporation and NeuonAI.
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: {
    flex: 1,
    gap: 2,
  },
});
