// The only place that talks to Claude. It runs headless Claude Code (`claude -p`),
// which bills your Max plan. ANTHROPIC_API_KEY is stripped from the environment so a
// stray key can never switch it to paid API usage. Swap this file to change providers.
import { spawn } from 'node:child_process';

export type Model = 'haiku' | 'sonnet' | 'opus';

type Ask = {
  prompt: string;
  model: Model;
  system?: string;
  /** JSON Schema: when set, the reply is parsed structured output. */
  schema?: object;
  timeoutMs?: number;
};

const CLAUDE = process.env.CLAUDE_BIN ?? 'claude';
const MAX_PARALLEL = 3;

let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function run(args: string[], input: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const child = spawn(CLAUDE, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`claude timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 300)}`));
    });
    child.stdin.end(input);
  });
}

async function once<T>({ prompt, model, system, schema, timeoutMs = 180_000 }: Ask): Promise<T> {
  const args = [
    '-p',
    '--model', model,
    '--output-format', 'json',
    // No tools, no MCP servers, no project settings: a plain text-in, text-out call.
    '--tools', '',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--no-session-persistence',
  ];
  if (system) args.push('--system-prompt', system);
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  const raw = await run(args, prompt, timeoutMs);
  const res = JSON.parse(raw);
  if (res.is_error) throw new Error(`claude error: ${String(res.result ?? res.subtype).slice(0, 300)}`);
  if (schema) {
    if (res.structured_output == null) throw new Error('claude returned no structured output');
    return res.structured_output as T;
  }
  return String(res.result ?? '').trim() as T;
}

/** One Claude call, at most 3 at a time, retried once on failure. */
export function ask<T = string>(a: Ask): Promise<T> {
  return slot(async () => {
    try {
      return await once<T>(a);
    } catch (e) {
      console.warn(`[claude] retrying after: ${(e as Error).message}`);
      return once<T>(a);
    }
  });
}
