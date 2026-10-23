import { Pressable, Text, View, type PressableProps, type StyleProp, type TextProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

type Weight = 400 | 500 | 600;
const BODY: Record<Weight, string> = { 400: fonts.body, 500: fonts.bodyMedium, 600: fonts.bodySemi };

export function T({ w = 400, size = 15, color, style, ...rest }: TextProps & { w?: Weight; size?: number; color?: string }) {
  const { t } = useTheme();
  return <Text {...rest} style={[{ fontFamily: BODY[w], fontSize: size, color: color ?? t.text }, style]} />;
}

export function Serif({ italic, size = 36, color, style, ...rest }: TextProps & { italic?: boolean; size?: number; color?: string }) {
  const { t } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: italic ? fonts.serifItalic : fonts.serif, fontSize: size, lineHeight: size * 1.06, letterSpacing: -0.01 * size, color: color ?? t.text },
        style,
      ]}
    />
  );
}

/** Outline button (Skip, Undo, chips). */
export function OutlineButton({ label, height = 50, size = 15, style, ...rest }: PressableProps & { label: string; height?: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={({ pressed }) => [
        { height, borderRadius: 16, borderWidth: 1, borderColor: t.btnLine, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <T w={500} size={size}>
        {label}
      </T>
    </Pressable>
  );
}

/** The solid DONE button. */
export function DoneButton({ style, label = 'DONE', ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; label?: string }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Done"
      {...rest}
      style={({ pressed }) => [
        { height: 50, borderRadius: 16, backgroundColor: t.doneBg, alignItems: 'center', justifyContent: 'center', opacity: rest.disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <T w={600} size={15} color={t.doneFg} style={{ letterSpacing: 1.2 }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: 2, backgroundColor: color }} />;
}
