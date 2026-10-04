import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { Icons, type IconName } from '@/constants/icons';
import { useTheme } from '@/hooks/use-theme';

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

// Every icon in the app sits next to a text label, so screen readers skip the icon itself.
export function Icon({ name, size = 22, color }: IconProps) {
  const theme = useTheme();

  return (
    <View aria-hidden>
      <SymbolView name={Icons[name]} size={size} tintColor={color ?? theme.text} />
    </View>
  );
}
