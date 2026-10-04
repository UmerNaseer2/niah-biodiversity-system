import {
  TabList,
  TabSlot,
  TabTrigger,
  Tabs,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/constants/icons';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plural } from '@/lib/format';
import { useRecords } from '@/state/records-context';

// Native tabs don't run in the browser, so the web preview draws its own bottom bar that
// looks close to the Android one. Keep the tabs in the same order as app-tabs.tsx.
export default function AppTabs() {
  const { pendingCount } = useRecords();

  return (
    <Tabs style={styles.fill}>
      <TabSlot style={styles.fill} />
      <TabList asChild>
        <TabBar>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="home" label="Home" />
          </TabTrigger>
          <TabTrigger name="scan" href="/scan" asChild>
            <TabButton icon="scan" label="Scan" />
          </TabTrigger>
          <TabTrigger name="new-record" href="/new-record" asChild>
            <TabButton icon="newRecord" label="New Record" />
          </TabTrigger>
          <TabTrigger name="records" href="/records" asChild>
            <TabButton icon="records" label="My Records" badge={pendingCount} />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="profile" label="Profile" />
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}

function TabBar(props: TabListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      {...props}
      style={[
        styles.bar,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
          paddingBottom: insets.bottom,
        },
      ]}>
      <View role="tablist" style={styles.barInner}>
        {props.children}
      </View>
    </View>
  );
}

type TabButtonProps = TabTriggerSlotProps & {
  icon: IconName;
  label: string;
  /** Number shown in a bubble on the icon. Hidden when 0. */
  badge?: number;
};

function TabButton({ icon, label, badge = 0, isFocused, ...props }: TabButtonProps) {
  const theme = useTheme();
  const color = isFocused ? theme.primary : theme.textSecondary;

  return (
    <Pressable
      {...props}
      role="tab"
      aria-selected={isFocused}
      aria-label={badge > 0 ? `${label}, ${plural(badge, 'record')} waiting to sync` : label}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <View style={[styles.iconPill, isFocused && { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={22} color={color} />
        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.badge }]}>
            <ThemedText style={styles.badgeText}>{badge}</ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText type="smallBold" numberOfLines={1} style={[styles.tabLabel, { color }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  bar: {
    borderTopWidth: 1,
    alignItems: 'center',
  },
  barInner: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  iconPill: {
    width: 56,
    height: 30,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
  },
  // At 12 px "New Record" and "My Records" almost touch on a 360 wide phone, so 11 it is.
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
});
