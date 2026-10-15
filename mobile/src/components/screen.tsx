import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  /** Tab screens pass a title. Pushed screens leave it out and use the stack header instead. */
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  /** Turn on for screens with text boxes, so iOS scrolls the focused box above the keyboard. */
  hasInputs?: boolean;
  children: ReactNode;
};

export function Screen({ title, eyebrow, subtitle, hasInputs = false, children }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isTabScreen = title !== undefined;

  // iOS moves the content clear of the tab bar and home indicator for us
  // (contentInsetAdjustmentBehavior below), and tab screens start below the status bar (see the
  // end). Android and web need the gaps added by hand. On Android the native tab bar already
  // keeps the bottom clear on tab screens.
  const manualInsets = Platform.OS !== 'ios';
  const paddingTop = (manualInsets && isTabScreen ? insets.top : 0) + Spacing.three;
  const paddingBottom = (manualInsets && !isTabScreen ? insets.bottom : 0) + Spacing.five;

  const content = (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop, paddingBottom }]}
      contentInsetAdjustmentBehavior="automatic"
      // Expo Router keeps every tab mounted, so only screens with text boxes listen to the
      // keyboard. Otherwise hidden tabs scroll around when it opens or closes somewhere else.
      automaticallyAdjustKeyboardInsets={hasInputs}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
      <View style={styles.inner}>
        {title ? (
          <View style={styles.header}>
            {eyebrow ? (
              <ThemedText type="overline" themeColor="primary">
                {eyebrow}
              </ThemedText>
            ) : null}
            <ThemedText type="title" role="heading">
              {title}
            </ThemedText>
            {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
          </View>
        ) : null}
        {children}
      </View>
    </ScrollView>
  );

  if (Platform.OS !== 'ios' || !isTabScreen) {
    return content;
  }

  // iOS tab screens have no header, so the ScrollView used to sit under the status bar and get
  // pushed down by an automatic top inset. When the keyboard closed, React Native reset the scroll
  // position without counting that inset and the page jumped up under the clock until you pulled
  // it down. Starting the page below the status bar means there is no top inset to lose.
  return (
    <SafeAreaView
      collapsable={false}
      edges={{ top: true }}
      style={[styles.scroll, { backgroundColor: theme.background }]}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
  },
});
