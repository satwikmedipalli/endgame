// A minimal UCI driver for a Stockfish binary (STOCKFISH_BIN, or `stockfish` on PATH).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export type Eval = { cp: number; mate?: number; best?: string };

/** Mate scores become ±10,000 centipawns minus the distance, so nearer mates score higher. */
export const MATE_CP = 10_000;

export class Engine {
  private proc: ChildProcessWithoutNullStreams;
  private waiters: ((line: string) => boolean)[] = [];

  constructor(bin = process.env.STOCKFISH_BIN ?? 'stockfish') {
    this.proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      this.waiters = this.waiters.filter((w) => !w(line));
    });
  }

  private send(cmd: string) {
    this.proc.stdin.write(cmd + '\n');
  }

  private until(match: (line: string) => boolean, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      this.waiters.push((line) => {
        onLine?.(line);
        if (!match(line)) return false;
        resolve(line);
        return true;
      });
    });
  }

  async init(threads = 2, hashMb = 128) {
    this.send('uci');
    await this.until((l) => l === 'uciok');
    this.send(`setoption name Threads value ${threads}`);
    this.send(`setoption name Hash value ${hashMb}`);
    this.send('isready');
    await this.until((l) => l === 'readyok');
  }

  /** Evaluation from the side to move's point of view, plus the best move (UCI). */
  async evaluate(fen: string, depth: number): Promise<Eval> {
    let last: Eval = { cp: 0 };
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    const done = await this.until(
      (l) => l.startsWith('bestmove'),
      (l) => {
        const m = /score (cp|mate) (-?\d+)/.exec(l);
        if (!m || !l.includes(' pv ')) return;
        const v = Number(m[2]);
        last = m[1] === 'cp' ? { cp: v } : { cp: v > 0 ? MATE_CP - v : -MATE_CP - v, mate: v };
      },
    );
    const best = done.split(' ')[1];
    return { ...last, best: best && best !== '(none)' ? best : undefined };
  }

  quit() {
    this.send('quit');
    this.proc.stdin.end();
  }
}
