import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useRecords } from '@/state/records-context';

// Native tab bar for iOS and Android. The web preview uses app-tabs.web.tsx, so when you add
// or rename a tab, change both files.
export default function AppTabs() {
  const theme = useTheme();
  const { pendingCount, mode } = useRecords();
  // Visitors only read about plants, so the tabs for making and sending records are hidden, and
  // only visitors get Plants and History. A phone that hasn't picked yet never gets here,
  // because the welcome page shows instead.
  const visitor = mode === 'visitor';
  // Only Android gets a solid bar colour. Leaving it unset on iOS keeps the system glass bar.
  const backgroundColor = Platform.OS === 'android' ? theme.backgroundElement : undefined;

  return (
    <NativeTabs
      tintColor={theme.primary}
      iconColor={{ default: theme.textSecondary, selected: theme.primary }}
      labelStyle={{
        default: { color: theme.textSecondary },
        selected: { color: theme.primary },
      }}
      backgroundColor={backgroundColor}
      indicatorColor={theme.primarySoft}
      badgeBackgroundColor={theme.badge}
      badgeTextColor="#FFFFFF">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="qrcode.viewfinder" md="qr_code_scanner" />
      </NativeTabs.Trigger>

      {/* Each tab is listed once and hidden instead of left out, because the tab bar treats a
          tab that isn't listed as one that doesn't exist. */}
      <NativeTabs.Trigger name="new-record" hidden={visitor}>
        <NativeTabs.Trigger.Label>New Record</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }}
          md="add_circle"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="records" hidden={visitor}>
        <NativeTabs.Trigger.Label>My Records</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }}
          md="list_alt"
        />
        <NativeTabs.Trigger.Badge hidden={pendingCount === 0}>
          {String(pendingCount)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="plants" hidden={!visitor}>
        <NativeTabs.Trigger.Label>Plants</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'leaf', selected: 'leaf.fill' }} md="eco" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="history" hidden={!visitor}>
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
      </NativeTabs.Trigger>

      {/* Visitors have no account, so the same tab holds their settings instead. */}
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{visitor ? 'Settings' : 'Profile'}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={
            visitor
              ? { default: 'gearshape', selected: 'gearshape.fill' }
              : { default: 'person.crop.circle', selected: 'person.crop.circle.fill' }
          }
          md={visitor ? 'settings' : 'account_circle'}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
