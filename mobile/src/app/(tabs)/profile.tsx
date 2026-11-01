import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { InfoRow } from '@/components/ui/info-row';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { canUpload, roleLabel } from '@/lib/account';
import { announce } from '@/lib/announce';
import { formatRecordedAt, plural } from '@/lib/format';
import { useAccount } from '@/state/account-context';
import { useRecords } from '@/state/records-context';
import { useSync } from '@/state/sync-context';

const NOT_FILLED_IN = 'Enter your email and password.';

function Avatar() {
  const theme = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
      <Icon name="profile" size={32} color={theme.primary} />
    </View>
  );
}

function SignInForm() {
  const { signIn, notice } = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const busy = useRef(false);

  function fail(message: string) {
    setError(message);
    announce(message);
  }

  async function submit() {
    if (busy.current) {
      return;
    }
    if (!email.trim() || !password) {
      fail(NOT_FILLED_IN);
      return;
    }
    busy.current = true;
    setSigningIn(true);
    setError(null);
    const message = await signIn(email.trim(), password);
    busy.current = false;
    setSigningIn(false);
    if (message) {
      setPassword('');
      fail(message);
    }
  }

  return (
    <>
      <View style={styles.account}>
        <Avatar />
        <View style={styles.accountText}>
          <ThemedText type="heading">Not signed in</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Sign in once while you have signal. After that the app works in the forest, and your
            records go up under your name.
          </ThemedText>
        </View>
      </View>
      {notice ? (
        <ThemedText type="smallBold" themeColor="warning" role="alert">
          {notice}
        </ThemedText>
      ) : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        secureTextEntry
        textContentType="password"
        onSubmitEditing={submit}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {error}
        </ThemedText>
      ) : null}
      <Button
        label={signingIn ? 'Signing in...' : 'Sign in'}
        icon="login"
        onPress={submit}
        disabled={signingIn}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Forgot your password? Ask an admin to send you a new link.
      </ThemedText>
    </>
  );
}

function SignedIn() {
  const { account, signOut } = useAccount();
  const { notUploadedCount } = useRecords();
  const [asking, setAsking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!account) {
    return null;
  }

  const askText =
    `${plural(notUploadedCount, 'record')} ${notUploadedCount === 1 ? 'is' : 'are'} still waiting. ` +
    `${notUploadedCount === 1 ? 'It stays' : 'They stay'} on this phone, and ` +
    `${notUploadedCount === 1 ? "it'll" : "they'll"} upload under whoever signs in next.`;

  async function leave() {
    setSigningOut(true);
    await signOut();
  }

  function press() {
    if (notUploadedCount > 0) {
      setAsking(true);
      announce(askText);
    } else {
      leave();
    }
  }

  return (
    <>
      <View style={styles.account}>
        <Avatar />
        <View style={styles.accountText}>
          <ThemedText type="heading">{account.name || account.email}</ThemedText>
          {account.name ? (
            <ThemedText type="small" themeColor="textSecondary">
              {account.email}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {roleLabel(account.role)}
          </ThemedText>
        </View>
      </View>
      {canUpload(account.role) ? null : (
        <ThemedText type="smallBold" themeColor="warning">
          Your account can&apos;t upload records yet. Ask an admin for the botanist role.
        </ThemedText>
      )}
      {asking ? (
        <View style={styles.ask}>
          <ThemedText type="smallBold" role="alert">
            {askText}
          </ThemedText>
          <Button label="Sign out anyway" onPress={leave} disabled={signingOut} />
          <Button
            label="Keep me signed in"
            variant="outline"
            onPress={() => setAsking(false)}
            disabled={signingOut}
          />
        </View>
      ) : (
        <Button label="Sign out" variant="outline" onPress={press} disabled={signingOut} />
      )}
    </>
  );
}

function AccountCard() {
  const theme = useTheme();
  const { status, configured } = useAccount();

  if (!configured) {
    return (
      <View style={styles.account}>
        <Avatar />
        <View style={styles.accountText}>
          <ThemedText type="heading">Not signed in</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Sign in isn&apos;t set up in this build, so records stay on this phone.
          </ThemedText>
        </View>
      </View>
    );
  }
  if (status === 'loading') {
    return <ActivityIndicator color={theme.primary} accessibilityLabel="Checking your sign in" />;
  }
  return status === 'signed-in' ? <SignedIn /> : <SignInForm />;
}

export default function ProfileScreen() {
  const { records, pendingCount, syncedCount } = useRecords();
  const { status } = useAccount();
  const { syncNow, running, message, lastSyncedAt } = useSync();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen title="Profile" hasInputs>
      <Card>
        <AccountCard />
      </Card>

      <Card title="This phone" icon="phone">
        <InfoRow label="Records on this phone" value={String(records.length)} />
        <InfoRow label="Waiting to sync" value={String(pendingCount)} />
        <InfoRow label="Synced" value={String(syncedCount)} />
        <InfoRow
          label="Last synced"
          value={lastSyncedAt ? formatRecordedAt(lastSyncedAt) : 'Not yet'}
        />
        {message ? (
          <ThemedText type="small" themeColor="textSecondary">
            {message}
          </ThemedText>
        ) : null}
        {status === 'signed-in' ? (
          <Button
            label={running ? 'Syncing...' : 'Sync now'}
            icon="sync"
            variant="outline"
            disabled={running}
            onPress={syncNow}
          />
        ) : null}
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
  ask: {
    gap: Spacing.two,
  },
});
