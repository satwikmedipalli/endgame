import { useHelper } from '../store/Helper';

export function useSyncLabel() {
  const { online, job, busy } = useHelper();
  const running = !!job && (job.status === 'queued' || job.status === 'running');
  const text = running
    ? job.status === 'queued'
      ? online
        ? 'Sync requested…'
        : 'Sync is queued. It starts when the helper is back.'
      : `Syncing: ${job.stage ?? busy ?? 'working'}`
    : job?.status === 'failed'
      ? `Sync failed: ${job.error ?? 'unknown error'}`
      : job?.status === 'done'
        ? 'Sync finished.'
        : null;
  return { running, text, online };
}

/** Sync button plus live progress. `day` targets a specific day (e.g. tomorrow). */
export function SyncButton({ day, label = 'Sync now' }: { day?: string; label?: string }) {
  const { requestSync } = useHelper();
  const { running, text } = useSyncLabel();
  return (
    <div className="sync">
      <button type="button" className="btn" disabled={running} onClick={() => requestSync(day)}>
        {running ? (
          <>
            <span className="spinner" aria-hidden /> Syncing
          </>
        ) : (
          label
        )}
      </button>
      {text && <p className="faint small">{text}</p>}
    </div>
  );
}
