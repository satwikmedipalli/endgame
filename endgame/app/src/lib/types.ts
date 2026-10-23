export type CardKind = 'news' | 'code' | 'stocks' | 'history' | 'chess' | 'italian' | 'watch';
export type CardStatus = 'open' | 'done' | 'skip';

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'code'; code: string; language?: string }
  | { type: 'callout'; label?: string; text: string }
  | { type: 'diagram'; title?: string; rows: { code: string; label?: string; value: string }[]; caption?: string }
  | { type: 'chart'; title?: string; kind: 'line' | 'bar'; points: number[]; labels?: string[]; caption?: string }
  | { type: 'chessBoard'; fen: string; caption?: string; highlight?: string[] }
  | { type: 'quiz'; question: string; code?: string; options: string[]; answer: number; explain: string }
  | { type: 'italianPhrase'; it: string; en: string; note?: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
}

export interface WatchState {
  stage: 'teaser' | 'pitch' | 'decided' | 'followup' | 'rated';
  willWatch?: boolean;
  rating?: number;
}

export interface Card {
  id: string;
  kind: CardKind;
  /** Course this card belongs to (syllabus key); news has none. */
  course?: string;
  title: string;
  hook: string;
  tag: string;
  cta: string;
  /** News only: "Covered by N sources". */
  sources?: number;
  blocks: Block[];
  /** Small preview shown on the feed card. */
  preview?: { fen?: string; phrase?: { it: string; en: string } };
  status: CardStatus;
  openedAt?: string;
  continued?: boolean;
  chat: ChatMessage[];
  watch?: WatchState;
  /** Last local or remote change; the newer side wins when syncing. */
  updatedAt?: string;
}

export interface DayFeed {
  day: string;
  builtAt: string;
  cards: Card[];
  /** 'sync' = built by the Mac's Sync; 'app' = the phone's fallback. A Sync day replaces a fallback day. */
  source?: 'app' | 'sync';
}
