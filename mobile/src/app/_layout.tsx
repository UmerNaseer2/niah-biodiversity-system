import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AccountProvider } from '@/state/account-context';
import { PublicCopyProvider } from '@/state/public-copy-context';
import { RecordsProvider, useRecords } from '@/state/records-context';
import { SyncProvider } from '@/state/sync-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * The pages that open above the tabs. Until someone picks who uses this phone, the welcome page
 * is the only one. Plant and species pages from the saved plant info open in both modes, and
 * staff record pages only open in staff mode.
 */
function RootStack({ tint }: { tint: string }) {
  const { mode } = useRecords();

  // Each page is listed once inside a guard instead of being left out with an if, because the
  // Stack warns about any child that isn't a page. A page whose guard is false can't be opened,
  // and when the open page loses its guard the Stack moves to the first page it still has.
  return (
    <Stack
      screenOptions={{
        headerTintColor: tint,
        headerBackButtonDisplayMode: 'minimal',
        // Without this the back button gets read out as "(tabs), back".
        headerBackTitle: 'Back',
      }}>
      <Stack.Protected guard={mode !== null}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="plant/[tag]" options={{ title: 'Plant info' }} />
        <Stack.Screen name="species/[slug]" options={{ title: 'Species' }} />
      </Stack.Protected>
      <Stack.Protected guard={mode === 'staff'}>
        <Stack.Screen name="record/[id]" options={{ title: 'Plant record' }} />
      </Stack.Protected>
      <Stack.Protected guard={mode === null}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const baseTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.backgroundElement,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <AccountProvider>
        <RecordsProvider>
          <SyncProvider>
            <PublicCopyProvider>
              <RootStack tint={colors.primary} />
            </PublicCopyProvider>
          </SyncProvider>
        </RecordsProvider>
      </AccountProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
