import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  required?: boolean;
  /** Unit shown inside the box, like "m". */
  suffix?: string;
  hint?: string;
  error?: string;
  ref?: Ref<TextInput>;
};

export function Field({
  label,
  required,
  suffix,
  hint,
  error,
  multiline,
  onFocus,
  onBlur,
  ref,
  ...rest
}: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  let borderColor: string = theme.outline;
  if (error) {
    borderColor = theme.danger;
  } else if (focused) {
    borderColor = theme.primary;
  }

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" aria-hidden>
        {label}
        {required ? <ThemedText type="smallBold" themeColor="danger"> *</ThemedText> : null}
      </ThemedText>
      <View style={[styles.box, { borderColor, backgroundColor: theme.background }]}>
        <TextInput
          ref={ref}
          aria-label={required ? `${label}, required` : label}
          accessibilityHint={error ?? hint}
          multiline={multiline}
          placeholderTextColor={theme.textSecondary}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, { color: theme.text }, multiline && styles.multiline]}
          {...rest}
        />
        {suffix ? (
          <ThemedText themeColor="textSecondary" aria-hidden>
            {suffix}
          </ThemedText>
        ) : null}
      </View>
      {error || hint ? (
        <ThemedText type="small" themeColor={error ? 'danger' : 'textSecondary'}>
          {error ?? hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    minHeight: 52,
    fontSize: 17,
    paddingVertical: 12,
    // Hides the browser's own focus ring on web, since the box border already turns green.
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
