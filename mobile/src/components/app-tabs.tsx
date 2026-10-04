import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useRecords } from '@/state/records-context';

// Native tab bar for iOS and Android. The web preview uses app-tabs.web.tsx, so when you add
// or rename a tab, change both files.
export default function AppTabs() {
  const theme = useTheme();
  const { pendingCount } = useRecords();
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

      <NativeTabs.Trigger name="new-record">
        <NativeTabs.Trigger.Label>New Record</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }}
          md="add_circle"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="records">
        <NativeTabs.Trigger.Label>My Records</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }}
          md="list_alt"
        />
        <NativeTabs.Trigger.Badge hidden={pendingCount === 0}>
          {String(pendingCount)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
