import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'outline';
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, icon, variant = 'primary', disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const colors = {
    primary: { background: theme.primary, border: theme.primary, text: theme.onPrimary },
    secondary: { background: theme.primarySoft, border: theme.primarySoft, text: theme.primary },
    outline: { background: 'transparent', border: theme.primary, text: theme.primary },
  }[variant];

  return (
    <Pressable
      role="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.background, borderColor: colors.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}>
      {icon ? <Icon name={icon} size={20} color={colors.text} /> : null}
      <ThemedText style={[styles.label, { color: colors.text }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.45,
  },
});
