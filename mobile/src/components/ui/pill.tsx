import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PillProps = {
  tone: 'success' | 'warning' | 'danger';
  label: string;
  icon?: IconName;
};

export function Pill({ tone, label, icon }: PillProps) {
  const theme = useTheme();
  const background = {
    success: theme.successSoft,
    warning: theme.warningSoft,
    danger: theme.dangerSoft,
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      {icon ? <Icon name={icon} size={14} color={theme[tone]} /> : null}
      <ThemedText style={[styles.label, { color: theme[tone] }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: 10,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
  },
});
