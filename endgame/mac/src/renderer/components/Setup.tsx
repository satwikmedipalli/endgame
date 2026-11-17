import { useState } from 'react';

import type { EndgameConfig } from '../../api';
import { config } from '../lib';

/**
 * First launch (or Settings → Change): your Supabase project and your Endgame login.
 * They're saved in a private file on this Mac, and the helper signs in with them too.
 */
export function Setup({ onDemo, onCancel }: { onDemo?: () => void; onCancel?: () => void }) {
  const [c, setC] = useState<EndgameConfig>(config ?? { supabaseUrl: '', supabaseKey: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const ok = /^https:\/\/.+/.test(c.supabaseUrl.trim()) && c.supabaseKey.trim().length > 10 && c.email.includes('@') && c.password.length >= 8;
  const field = (key: keyof EndgameConfig, label: string, type = 'text', hint?: string) => (
    <label className="form-row">
      <span>{label}</span>
      <input
        className="field"
        type={type}
        value={c[key]}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setC({ ...c, [key]: e.target.value })}
      />
      {hint && <small className="faint">{hint}</small>}
    </label>
  );
  return (
    <div className="setup">
      <div className="setup-inner">
        <h1 className="title">Endgame</h1>
        <p className="muted">
          {config ? 'Change where Endgame keeps your days, or the login it uses.' : 'One-time setup. If you used the old Mac helper, this was filled in from its settings.'}
        </p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok || busy) return;
            setBusy(true);
            // Saving restarts Endgame so the helper picks up the new settings.
            window.endgame.saveConfig(c);
          }}
        >
          {field('supabaseUrl', 'Supabase project URL', 'url', 'https://<project>.supabase.co')}
          {field('supabaseKey', 'Publishable key', 'text', 'Project Settings → API Keys. Never the secret key.')}
          {field('email', 'Your Endgame email', 'email')}
          {field('password', 'Password', 'password', 'The app and the helper both sign in with it. Stored only in a private file on this Mac.')}
          <div className="row gap-s">
            <button type="submit" className="btn btn-done grow" disabled={!ok || busy}>
              {busy ? 'Restarting…' : 'Save and start'}
            </button>
            {onCancel && (
              <button type="button" className="btn" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </form>
        {onDemo && (
          <button type="button" className="link" onClick={onDemo}>
            Just look around with a sample day first
          </button>
        )}
      </div>
    </div>
  );
}
