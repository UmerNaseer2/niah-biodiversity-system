import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { RecordsProvider } from '@/state/records-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

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
      <RecordsProvider>
        <Stack
          screenOptions={{
            headerTintColor: colors.primary,
            headerBackButtonDisplayMode: 'minimal',
            // Without this the back button gets read out as "(tabs), back".
            headerBackTitle: 'Back',
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="record/[id]" options={{ title: 'Plant record' }} />
        </Stack>
      </RecordsProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
