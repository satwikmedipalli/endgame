import { useEffect, useState } from 'react';

import type { ThemePref } from '@shared/sun';
import type { HelperState } from '../../api';
import { config, supabase } from '../lib';
import { useAuth } from '../store/Auth';
import { useFeed } from '../store/Feed';
import { useHelper } from '../store/Helper';
import { useTheme } from '../theme';
import { SyncButton } from './Sync';

export function useHelperState() {
  const [s, setS] = useState<HelperState | null>(null);
  useEffect(() => {
    window.endgame.helperState().then(setS);
    return window.endgame.onHelperState(setS);
  }, []);
  return s;
}

export function Settings({ onEditSetup }: { onEditSetup: () => void }) {
  const { pref, setPref, label } = useTheme();
  const { rebuild, resetAll, sync, syncNow } = useFeed();
  const auth = useAuth();
  const helper = useHelper();
  const hs = useHelperState();
  const [log, setLog] = useState<string[]>([]);
  const [login, setLogin] = useState<boolean | null>(null);
  useEffect(() => {
    window.endgame.helperLog().then(setLog);
    window.endgame.getLoginItem().then(setLogin);
  }, []);

  const syncLabel =
    sync.status === 'local'
      ? 'On this Mac only'
      : sync.status === 'syncing'
        ? 'Syncing…'
        : sync.status === 'offline'
          ? `Offline. Changes are saved here and will sync later.${sync.error ? ` (${sync.error})` : ''}`
          : `Synced${sync.at ? ` at ${new Date(sync.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`;
  const options: { key: ThemePref; name: string }[] = [
    { key: 'auto', name: 'Auto (sun)' },
    { key: 'light', name: 'Day' },
    { key: 'dark', name: 'Night' },
  ];
  const helperLine =
    hs?.state === 'running'
      ? `Running inside Endgame${helper.busy ? ` · ${helper.busy}` : ''}`
      : hs?.state === 'starting'
        ? 'Starting…'
        : hs?.state === 'error'
          ? `Can't start: ${hs.error}. Retrying every minute.`
          : 'Not set up: add your email and password below.';

  return (
    <div className="stack">
      <h1 className="sheet-title">Settings</h1>

      <section className="panel">
        <h3 className="panel-title">Theme</h3>
        <div className="row gap-s">
          {options.map((o) => (
            <button key={o.key} type="button" className={`btn grow${pref === o.key ? ' btn-done' : ''}`} aria-pressed={pref === o.key} onClick={() => setPref(o.key)}>
              {o.name}
            </button>
          ))}
        </div>
        <p className="faint small">{label}. Sunrise and sunset are worked out for Richardson, TX. The Dock icon follows the theme.</p>
      </section>

      <section className="panel">
        <h3 className="panel-title">Helper</h3>
        <p className="row gap-s small">
          <span className={`dot${hs?.state === 'running' ? ' on' : ''}`} />
          {helperLine}
        </p>
        <p className="small muted">
          {hs?.claude ? (
            <>
              Claude Code: <code>{hs.claude}</code>
            </>
          ) : (
            'Claude Code (the claude command) was not found. Install it and sign in, then reopen Endgame.'
          )}
        </p>
        <p className="faint small">
          Sync pulls the news and writes every card with your Claude plan (no API keys). Before 5 PM it builds today; after, tomorrow. The helper runs while Endgame is open,
          including when its window is closed (it stays in the menu bar).
        </p>
        {auth.session && <SyncButton />}
        <label className="row gap-s small">
          <input type="checkbox" checked={!!login} onChange={(e) => (setLogin(e.target.checked), window.endgame.setLoginItem(e.target.checked))} />
          Open Endgame at login
        </label>
        {log.length > 0 && <pre className="log">{log.slice(-14).join('\n')}</pre>}
        <button type="button" className="link" onClick={() => window.endgame.openLog()}>
          Open the full helper log
        </button>
      </section>

      <section className="panel">
        <h3 className="panel-title">Account</h3>
        <p className="small muted">{supabase ? (auth.session?.user.email ?? 'Not signed in') : 'Supabase is not set up'}</p>
        <p className="row gap-s small">
          <span className={`dot${sync.status === 'synced' ? ' on' : ''}`} />
          {syncLabel}
        </p>
        <div className="row gap-s">
          {auth.session && (
            <button type="button" className="btn grow" onClick={syncNow}>
              Sync this Mac now
            </button>
          )}
          <button type="button" className="btn grow" onClick={onEditSetup}>
            {config ? 'Change Supabase or login…' : 'Set up Supabase…'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Today&apos;s paper</h3>
        <p className="small muted">Rebuilding keeps what you already marked and your chats. It only adds or reorders cards.</p>
        <button type="button" className="btn" onClick={rebuild}>
          Rebuild today&apos;s paper
        </button>
        {!supabase && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.confirm('Reset everything? This deletes every stored day and chat on this Mac and reloads the sample day.')) resetAll();
            }}
          >
            Reset to sample day
          </button>
        )}
      </section>
    </div>
  );
}
