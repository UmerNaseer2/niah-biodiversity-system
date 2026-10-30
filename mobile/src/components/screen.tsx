import type { ReactElement, ReactNode } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenHeaderProps = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
};

type ScreenProps = {
  /** Tab screens pass a title. Pushed screens leave it out and use the stack header instead. */
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  /** Turn on for screens with text boxes, so the focused box scrolls up above the keyboard. */
  hasInputs?: boolean;
  children: ReactNode;
};

function ScreenHeader({ title, eyebrow, subtitle }: ScreenHeaderProps) {
  return (
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
  );
}

/** The space above and below the page, which depends on the platform. */
function usePagePadding(isTabScreen: boolean) {
  const insets = useSafeAreaInsets();
  // iOS moves the content clear of the tab bar and home indicator for us
  // (contentInsetAdjustmentBehavior on the ScrollView), and tab screens start below the status
  // bar (see TabScreenFrame). Android and web need the gaps added by hand. On Android the native
  // tab bar already keeps the bottom clear on tab screens.
  const manualInsets = Platform.OS !== 'ios';
  return {
    paddingTop: (manualInsets && isTabScreen ? insets.top : 0) + Spacing.three,
    paddingBottom: (manualInsets && !isTabScreen ? insets.bottom : 0) + Spacing.five,
  };
}

/**
 * iOS tab screens have no header, so the ScrollView used to sit under the status bar and get
 * pushed down by an automatic top inset. When the keyboard closed, React Native reset the scroll
 * position without counting that inset and the page jumped up under the clock until you pulled
 * it down. Starting the page below the status bar means there is no top inset to lose.
 */
function TabScreenFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  if (Platform.OS !== 'ios') {
    return children;
  }
  return (
    <SafeAreaView
      collapsable={false}
      edges={{ top: true }}
      style={[styles.scroll, { backgroundColor: theme.background }]}>
      {children}
    </SafeAreaView>
  );
}

export function Screen({ title, eyebrow, subtitle, hasInputs = false, children }: ScreenProps) {
  const theme = useTheme();
  const isTabScreen = title !== undefined;
  const padding = usePagePadding(isTabScreen);

  const content = (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, padding]}
      contentInsetAdjustmentBehavior="automatic"
      // Expo Router keeps every tab mounted, so only screens with text boxes listen to the
      // keyboard. Otherwise hidden tabs scroll around when it opens or closes somewhere else.
      automaticallyAdjustKeyboardInsets={hasInputs}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
      <View style={styles.inner}>
        {title ? <ScreenHeader title={title} eyebrow={eyebrow} subtitle={subtitle} /> : null}
        {children}
      </View>
    </ScrollView>
  );

  if (Platform.OS === 'android' && hasInputs) {
    // Android apps now draw edge to edge (Expo SDK 54 and up), so the window no longer shrinks
    // when the keyboard opens and the boxes near the bottom would end up under it. Padding the
    // page by the keyboard height gives the ScrollView room to bring the focused box into view.
    return (
      <KeyboardAvoidingView behavior="padding" style={styles.scroll}>
        {content}
      </KeyboardAvoidingView>
    );
  }

  return isTabScreen ? <TabScreenFrame>{content}</TabScreenFrame> : content;
}

type ListScreenProps<T> = ScreenHeaderProps & {
  /** Goes between the title and the list, and scrolls with them. */
  header?: ReactNode;
  data: readonly T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  /** Shown under the header when there's nothing in the list. */
  empty?: ReactNode;
};

/**
 * A tab screen that's mostly one long list, like My records. It looks the same as Screen, but
 * only draws the rows near the screen, so it stays quick with a few thousand of them. A list
 * like that can't go inside Screen's ScrollView, so this scrolls by itself. No text boxes.
 */
export function ListScreen<T>({
  title,
  eyebrow,
  subtitle,
  header,
  data,
  keyExtractor,
  renderItem,
  empty,
}: ListScreenProps<T>) {
  const theme = useTheme();
  const padding = usePagePadding(true);

  return (
    <TabScreenFrame>
      <FlatList
        style={[styles.scroll, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.content, padding]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        data={data}
        keyExtractor={keyExtractor}
        // Each part sits in its own centred column, so the page lines up with the other tabs
        // on a tablet.
        ListHeaderComponent={
          <View style={[styles.inner, styles.listHeader]}>
            <ScreenHeader title={title} eyebrow={eyebrow} subtitle={subtitle} />
            {header}
          </View>
        }
        renderItem={({ item }) => <View style={styles.inner}>{renderItem(item)}</View>}
        ItemSeparatorComponent={ListGap}
        ListEmptyComponent={empty ? <View style={styles.inner}>{empty}</View> : null}
      />
    </TabScreenFrame>
  );
}

function ListGap() {
  return <View style={styles.listGap} />;
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
  listHeader: {
    marginBottom: Spacing.three,
  },
  listGap: {
    height: 12,
  },
});
