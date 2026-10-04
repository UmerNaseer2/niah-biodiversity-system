import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  /** Tab screens pass a title. Pushed screens leave it out and use the stack header instead. */
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  children: ReactNode;
};

export function Screen({ title, eyebrow, subtitle, children }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isTabScreen = title !== undefined;

  // iOS moves the content clear of the status bar, tab bar and home indicator for us
  // (contentInsetAdjustmentBehavior below). Android and web need the gaps added by hand.
  // On Android the native tab bar already keeps the bottom clear on tab screens.
  const manualInsets = Platform.OS !== 'ios';
  const paddingTop = (manualInsets && isTabScreen ? insets.top : 0) + Spacing.three;
  const paddingBottom = (manualInsets && !isTabScreen ? insets.bottom : 0) + Spacing.five;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop, paddingBottom }]}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
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
