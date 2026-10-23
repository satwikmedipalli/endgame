import type { CardKind } from '@/lib/types';
import type { ThemeMode } from '@/lib/sun';

export const palettes = {
  dark: {
    bg: '#0A0A0D',
    card: '#141419',
    cardLine: 'rgba(255,255,255,0.07)',
    shadow: 'rgba(0,0,0,0.55)',
    text: '#F2EEE6',
    body: '#E4DFD6',
    muted: '#A19D96',
    faint: '#8E8A84',
    chip: 'rgba(255,255,255,0.07)',
    btnLine: 'rgba(255,255,255,0.14)',
    doneBg: '#F2EEE6',
    doneFg: '#0A0A0D',
    sqIdle: '#1E1E25',
    sqCur: '#26262E',
    sqDone: '#F2EEE6',
    sqSkip: 'rgba(255,255,255,0.28)',
    dots: ['#2A2A33', '#34343E', '#3F3F4A'],
    boardDark: '#3B3552',
    boardLight: '#D3CAEC',
    codeBg: '#0E0E12',
    ok: '#9FD8A0',
  },
  light: {
    bg: '#F4F1EA',
    card: '#FFFFFF',
    cardLine: 'rgba(23,22,26,0.08)',
    shadow: 'rgba(60,48,30,0.12)',
    text: '#17161A',
    body: '#2E2B28',
    muted: '#5C5852',
    faint: '#6B675F',
    chip: 'rgba(23,22,26,0.06)',
    btnLine: 'rgba(23,22,26,0.16)',
    doneBg: '#17161A',
    doneFg: '#F4F1EA',
    sqIdle: '#E3DED3',
    sqCur: '#D6D0C3',
    sqDone: '#17161A',
    sqSkip: 'rgba(23,22,26,0.3)',
    dots: ['#E6E1D7', '#D9D3C7', '#CCC5B7'],
    boardDark: '#7E6FB8',
    boardLight: '#E9E3F7',
    codeBg: '#F4F1EA',
    ok: '#3C7D3E',
  },
};

export type Palette = (typeof palettes)['light'];

// [hex, "r,g,b"] per theme, so washes and lines can be derived with alpha.
const ACCENTS: Record<CardKind, Record<ThemeMode, [string, string]>> = {
  news: { dark: ['#E8B86D', '232,184,109'], light: ['#8C5F16', '140,95,22'] },
  code: { dark: ['#7FD1B9', '127,209,185'], light: ['#1F7A63', '31,122,99'] },
  history: { dark: ['#E89A7F', '232,154,127'], light: ['#A84E33', '168,78,51'] },
  chess: { dark: ['#C9B8FF', '201,184,255'], light: ['#6A55B8', '106,85,184'] },
  stocks: { dark: ['#9DB8FF', '157,184,255'], light: ['#3B5BB5', '59,91,181'] },
  italian: { dark: ['#9FD8A0', '159,216,160'], light: ['#3C7D3E', '60,125,62'] },
  watch: { dark: ['#F2A6C8', '242,166,200'], light: ['#A8457A', '168,69,122'] },
};

export function accent(kind: CardKind, mode: ThemeMode) {
  const [hex, rgb] = ACCENTS[kind][mode];
  return { color: hex, line: `rgba(${rgb},0.35)`, wash: `rgba(${rgb},0.10)`, soft: `rgba(${rgb},0.22)` };
}

export const KIND_LABEL: Record<CardKind, string> = {
  news: 'News',
  code: 'Coding',
  history: 'History',
  chess: 'Chess',
  stocks: 'Markets',
  italian: 'Italiano',
  watch: 'Watch',
};

export const fonts = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'BricolageGrotesque_400Regular',
  bodyMedium: 'BricolageGrotesque_500Medium',
  bodySemi: 'BricolageGrotesque_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
};
