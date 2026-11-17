// Apps opened from the Dock get a bare PATH, so `claude` (installed by npm, Homebrew or the
// native installer) wouldn't be found. Take PATH from a login shell, plus the usual spots.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export function fixPath() {
  const extra = [join(homedir(), '.local/bin'), join(homedir(), '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin'];
  let fromShell = '';
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const out = execFileSync(shell, ['-ilc', 'printf "__PATH__%s__END__" "$PATH"'], { encoding: 'utf8', timeout: 5000 });
    fromShell = out.match(/__PATH__(.*)__END__/)?.[1] ?? '';
  } catch {
    // Fall back to the usual locations below.
  }
  const parts = [...fromShell.split(delimiter), ...(process.env.PATH ?? '').split(delimiter), ...extra].filter(Boolean);
  process.env.PATH = [...new Set(parts)].join(delimiter);
}

export function findClaude(): string | null {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const p = join(dir, 'claude');
    if (existsSync(p)) return p;
  }
  return null;
}
