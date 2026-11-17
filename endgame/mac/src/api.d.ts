// The bridge between the window and the main process (see preload.ts).

export type EndgameConfig = {
  supabaseUrl: string;
  /** The publishable key; row-level security is what protects the data. */
  supabaseKey: string;
  email: string;
  password: string;
};

export type HelperState = {
  state: 'off' | 'starting' | 'running' | 'error';
  error?: string;
  /** Where the `claude` command was found, or null if it wasn't. */
  claude?: string | null;
};

export type Command = 'sync' | 'progress' | 'settings' | 'front';

export interface EndgameApi {
  getConfig(): Promise<EndgameConfig | null>;
  saveConfig(c: EndgameConfig): Promise<void>;
  helperState(): Promise<HelperState>;
  onHelperState(cb: (s: HelperState) => void): () => void;
  helperLog(): Promise<string[]>;
  openLog(): void;
  setTheme(mode: 'light' | 'dark'): void;
  setProgress(p: { left: number; total: number; finished: boolean }): void;
  openExternal(url: string): void;
  copy(text: string): void;
  quit(): void;
  onCommand(cb: (cmd: Command) => void): () => void;
  getLoginItem(): Promise<boolean>;
  setLoginItem(on: boolean): void;
}

declare global {
  interface Window {
    endgame: EndgameApi;
  }
}
