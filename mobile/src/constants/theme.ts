/**
 * Colours, fonts and spacing for the app. Forest greens for the park, amber for anything
 * still waiting to sync. Text colours pass WCAG AA (4.5:1) on both the page background and
 * cards, since people will be reading these screens outdoors in bright light. `outline` is
 * for the edges of things you type in or tap (fields, chips) and stays above 3:1.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#16201A',
    textSecondary: '#5B6B60',
    background: '#F5F7F2',
    backgroundElement: '#FFFFFF',
    border: '#DCE3D6',
    outline: '#7F8D83',
    primary: '#1F6B3A',
    onPrimary: '#FFFFFF',
    primarySoft: '#E2F0E5',
    warning: '#8F5700',
    warningSoft: '#FFF1D6',
    success: '#1D7340',
    successSoft: '#DDF3E4',
    danger: '#B3261E',
    dangerSoft: '#FCE4E2',
    badge: '#8F5700',
  },
  dark: {
    text: '#ECF2EC',
    textSecondary: '#A3B3A7',
    background: '#0E1410',
    backgroundElement: '#18211B',
    border: '#2C3A31',
    outline: '#617366',
    primary: '#5FBF7F',
    onPrimary: '#06210F',
    primarySoft: '#1C3324',
    warning: '#F2B544',
    warningSoft: '#3A2A0B',
    success: '#6FD495',
    successSoft: '#123322',
    danger: '#FF8A80',
    dangerSoft: '#3B1412',
    // Same dark amber as light mode so the white number on the tab badge stays readable.
    badge: '#8F5700',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const MaxContentWidth = 640;
