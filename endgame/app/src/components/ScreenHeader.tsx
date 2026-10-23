import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Icon } from './Icon';
import { Serif } from './ui';

export function ScreenHeader({ title }: { title: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to feed"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="back" size={18} color={t.text} stroke={1.9} />
      </Pressable>
      <Serif size={32}>{title}</Serif>
    </View>
  );
}
