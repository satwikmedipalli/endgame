// Settings live in ~/Library/Application Support/Endgame/endgame.env (chmod 600), in the
// same KEY=value form as the old worker/.env, which is imported on first launch.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { EndgameConfig } from '../api';

const OLD_HELPER_ENV = [join(homedir(), 'endgame/endgame/worker/.env'), join(homedir(), 'endgame/worker/.env')];

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const quote = (v: string) => (/[\s#"']/.test(v) ? JSON.stringify(v) : v);

export class Config {
  readonly file: string;
  private vars: Record<string, string> = {};

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'endgame.env');
    if (existsSync(this.file)) this.vars = parseEnv(readFileSync(this.file, 'utf8'));
    else this.importOld();
  }

  /** First launch: take the helper's settings from the repo if they're there. */
  private importOld() {
    const old = OLD_HELPER_ENV.find(existsSync);
    if (!old) return;
    this.vars = parseEnv(readFileSync(old, 'utf8'));
    this.write();
  }

  private write() {
    const body = ['# Endgame settings. Kept private to your user (chmod 600).', ...Object.entries(this.vars).map(([k, v]) => `${k}=${quote(v)}`)].join('\n');
    writeFileSync(this.file, body + '\n', { mode: 0o600 });
    chmodSync(this.file, 0o600);
  }

  get(): EndgameConfig | null {
    const v = this.vars;
    if (!v.SUPABASE_URL || !v.SUPABASE_KEY) return null;
    return { supabaseUrl: v.SUPABASE_URL, supabaseKey: v.SUPABASE_KEY, email: v.ENDGAME_EMAIL ?? '', password: v.ENDGAME_PASSWORD ?? '' };
  }

  save(c: EndgameConfig) {
    this.vars = { ...this.vars, SUPABASE_URL: c.supabaseUrl.trim(), SUPABASE_KEY: c.supabaseKey.trim(), ENDGAME_EMAIL: c.email.trim(), ENDGAME_PASSWORD: c.password };
    this.write();
  }

  /** Everything in the file goes into the environment (the helper reads it from there). */
  apply() {
    for (const [k, v] of Object.entries(this.vars)) process.env[k] = v;
  }

  get complete() {
    const v = this.vars;
    return !!(v.SUPABASE_URL && v.SUPABASE_KEY && v.ENDGAME_EMAIL && v.ENDGAME_PASSWORD);
  }
}
