export type CardKind = 'news' | 'code' | 'stocks' | 'history' | 'chess' | 'italian' | 'watch';
export type CardStatus = 'open' | 'done' | 'skip';

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'code'; code: string; language?: string }
  | { type: 'callout'; label?: string; text: string }
  | { type: 'diagram'; title?: string; rows: { code: string; label?: string; value: string }[]; caption?: string }
  | { type: 'chart'; title?: string; kind: 'line' | 'bar'; points: number[]; labels?: string[]; caption?: string }
  | { type: 'chart'; title?: string; kind: 'candle'; candles: Candle[]; labels?: string[]; caption?: string }
  | { type: 'chessBoard'; fen: string; caption?: string; highlight?: string[]; arrows?: string[]; orientation?: 'w' | 'b' }
  /** Tap the answer on the board: a square ("f3") or a move in notation ("Nxe5+"). */
  | { type: 'chessDrill'; fen: string; question: string; mode: 'square' | 'move'; answer: string; explain?: string; orientation?: 'w' | 'b' }
  | { type: 'quiz'; question: string; code?: string; options: string[]; answer: number; explain: string }
  /** `learn`: a new word or phrase that joins your spaced-repetition deck when you press DONE. */
  | { type: 'italianPhrase'; it: string; en: string; note?: string; learn?: boolean }
  /** Flashcards for words due today; answers are stored on the card (practice.grades). */
  | { type: 'vocabReview'; items: { id: string; it: string; en: string; note?: string }[] };

/** One candlestick: open, high, low, close. */
export type Candle = { o: number; h: number; l: number; c: number };

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
  /** Optional one line after rating. */
  comment?: string;
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
  /** Italian: your flashcard answers by word id (1 Again … 4 Easy), applied by the Mac on DONE. */
  practice?: { grades: Record<string, 1 | 2 | 3 | 4> };
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
