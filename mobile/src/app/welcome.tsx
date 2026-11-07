import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useSwitchMode } from '@/hooks/use-switch-mode';
import { useTheme } from '@/hooks/use-theme';

type ChoiceProps = {
  icon: IconName;
  title: string;
  description: string;
  disabled: boolean;
  onPress: () => void;
};

function Choice({ icon, title, description, disabled, onPress }: ChoiceProps) {
  const theme = useTheme();

  return (
    <Pressable
      role="button"
      aria-label={`${title}. ${description}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <View style={[styles.choiceIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={24} color={theme.primary} />
      </View>
      <View style={styles.choiceText}>
        <ThemedText type="heading">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      <Icon name="chevron" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

// The first page on a new phone. Once a choice is saved the root layout swaps this page for the
// tabs, and it doesn't come back.
export default function WelcomeScreen() {
  const { switchTo, switching, error } = useSwitchMode();

  return (
    <Screen
      eyebrow="Niah National Park"
      title="Welcome"
      subtitle="Pick how you'll use the app. You can change this later.">
      <View style={styles.choices}>
        <Choice
          icon="visitor"
          title="I'm visiting the park"
          description="Scan the QR tags on plants to read about them. Works with no signal once the plant info is on your phone."
          disabled={switching}
          onPress={() => switchTo('visitor')}
        />
        <Choice
          icon="staff"
          title="I work at the park"
          description="Record plants and send them to the team. You'll sign in with your staff account."
          disabled={switching}
          onPress={() => switchTo('staff')}
        />
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {error}
        </ThemedText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: {
    gap: 12,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    flex: 1,
    gap: 2,
  },
});
