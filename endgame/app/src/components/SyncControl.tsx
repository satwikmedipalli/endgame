import { ActivityIndicator, View } from 'react-native';

import { useHelper } from '@/store/Helper';
import { useTheme } from '@/theme/ThemeProvider';
import { OutlineButton, T } from './ui';

export function useSyncLabel() {
  const { online, job, busy } = useHelper();
  const running = !!job && (job.status === 'queued' || job.status === 'running');
  const text = running
    ? job.status === 'queued'
      ? online
        ? 'Sync requested…'
        : 'Sync is queued. It starts when your Mac is on.'
      : `Syncing: ${job.stage ?? busy ?? 'working'}`
    : job?.status === 'failed'
      ? `Sync failed: ${job.error ?? 'unknown error'}`
      : job?.status === 'done'
        ? 'Sync finished.'
        : null;
  return { running, text, online };
}

/** Sync button plus live progress from the Mac. `day` targets a specific day (e.g. tomorrow). */
export function SyncControl({ day, label = 'Sync now' }: { day?: string; label?: string }) {
  const { t } = useTheme();
  const { requestSync } = useHelper();
  const { running, text, online } = useSyncLabel();
  return (
    <View style={{ gap: 10 }}>
      {running ? (
        <View style={{ height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: t.btnLine }}>
          <ActivityIndicator color={t.muted} />
          <T w={500} size={15} color={t.muted}>
            Syncing
          </T>
        </View>
      ) : (
        <OutlineButton label={online ? label : `${label} (when the Mac is on)`} onPress={() => requestSync(day)} />
      )}
      {text && (
        <T size={12} color={t.faint} style={{ lineHeight: 18 }}>
          {text}
        </T>
      )}
    </View>
  );
}
