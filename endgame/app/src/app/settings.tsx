import { router } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SyncControl } from '@/components/SyncControl';
import { OutlineButton, T } from '@/components/ui';
import type { ThemePref } from '@/lib/sun';
import { useAuth } from '@/store/AuthProvider';
import { useFeed } from '@/store/FeedStore';
import { useHelper } from '@/store/Helper';
import { useTheme } from '@/theme/ThemeProvider';

function confirm(title: string, body: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${body}`)) onYes();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes', style: 'destructive', onPress: onYes },
  ]);
}

export default function Settings() {
  const { t, pref, setPref, label } = useTheme();
  const insets = useSafeAreaInsets();
  const { rebuild, resetAll, sync, syncNow } = useFeed();
  const auth = useAuth();
  const helper = useHelper();
  const seen = helper.lastSeen ? new Date(helper.lastSeen).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  const syncLabel =
    sync.status === 'local'
      ? 'On this device only'
      : sync.status === 'syncing'
        ? 'Syncing…'
        : sync.status === 'offline'
          ? `Offline. Changes are saved here and will sync later.${sync.error ? ` (${sync.error})` : ''}`
          : `Synced${sync.at ? ` at ${new Date(sync.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`;
  const panel = { padding: 18, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine, gap: 14 } as const;

  const options: { key: ThemePref; name: string }[] = [
    { key: 'auto', name: 'Auto (sun)' },
    { key: 'light', name: 'Light' },
    { key: 'dark', name: 'Dark' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
        <View style={panel}>
          <T w={500} size={15}>
            Theme
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {options.map((o) => {
              const on = pref === o.key;
              return (
                <Pressable
                  key={o.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setPref(o.key)}
                  style={{ flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.doneBg : 'transparent', borderWidth: on ? 0 : 1, borderColor: t.btnLine }}
                >
                  <T w={500} size={14} color={on ? t.doneFg : t.text}>
                    {o.name}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <T size={12} color={t.faint}>
            {label}. Sunrise and sunset are worked out for Richardson, TX.
          </T>
        </View>

        <View style={panel}>
          <T w={500} size={15}>
            Today&apos;s feed
          </T>
          <T size={13} color={t.muted} style={{ lineHeight: 19 }}>
            Rebuilding keeps what you already marked and your chats. It only adds or reorders cards.
          </T>
          <OutlineButton
            label="Rebuild today's feed"
            onPress={() => {
              rebuild();
              router.replace('/');
            }}
          />
        </View>

        <View style={panel}>
          <T w={500} size={15}>
            Account
          </T>
          <T size={14} color={t.muted}>
            {auth.enabled ? (auth.session?.user.email ?? 'Not signed in') : 'Supabase is not set up (.env.local missing)'}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: sync.status === 'synced' ? t.ok : t.faint }} />
            <T size={13} color={t.muted} style={{ flex: 1 }}>
              {syncLabel}
            </T>
          </View>
          {auth.session && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <OutlineButton label="Sync now" onPress={syncNow} style={{ flex: 1 }} />
              <OutlineButton
                label="Sign out"
                onPress={() => confirm('Sign out?', 'Your cards stay on the server. You will need a new code to sign back in.', auth.signOut)}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </View>

        <View style={panel}>
          <T w={500} size={15}>
            Mac helper
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: helper.online ? t.ok : t.faint }} />
            <T size={14} color={t.muted}>
              {helper.online ? `Connected${helper.busy ? ` · ${helper.busy}` : ''}` : seen ? `Offline · last seen ${seen}` : 'Not set up yet'}
            </T>
          </View>
          <T size={12} color={t.faint} style={{ lineHeight: 18 }}>
            Sync pulls the news and writes every card with your Claude Max plan (no API keys). Before 5 PM it builds today; after, tomorrow.
          </T>
          {auth.session && <SyncControl />}
        </View>

        <View style={panel}>
          <T w={500} size={15}>
            Sample data
          </T>
          <OutlineButton
            label="Reset to sample day"
            onPress={() =>
              confirm('Reset everything?', 'This deletes every stored day and chat, on this device and in Supabase, and reloads the sample feed.', () => {
                resetAll().then(() => router.replace('/'));
              })
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}
