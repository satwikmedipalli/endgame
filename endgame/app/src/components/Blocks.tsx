import * as Speech from 'expo-speech';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import type { Block, CardKind } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { accent, fonts } from '@/theme/tokens';
import { ChessBoard } from './ChessBoard';
import { Icon } from './Icon';
import { Serif, T } from './ui';

export function speakItalian(text: string) {
  Speech.stop();
  Speech.speak(text, { language: 'it-IT', rate: 0.9 });
}

function Panel({ children, gap = 14 }: { children: React.ReactNode; gap?: number }) {
  const { t, mode } = useTheme();
  return (
    <View
      style={{
        gap,
        padding: 18,
        borderRadius: 20,
        backgroundColor: t.card,
        borderWidth: 1,
        borderColor: t.cardLine,
        shadowColor: t.shadow,
        shadowOpacity: mode === 'light' ? 0.5 : 0,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      {children}
    </View>
  );
}

function Mono({ children, size = 14, color }: { children: React.ReactNode; size?: number; color?: string }) {
  const { t } = useTheme();
  return <Text style={{ fontFamily: fonts.mono, fontSize: size, lineHeight: size * 1.7, color: color ?? t.text }}>{children}</Text>;
}

function Quiz({ b, kind }: { b: Extract<Block, { type: 'quiz' }>; kind: CardKind }) {
  const { t, mode } = useTheme();
  const a = accent(kind, mode);
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === b.answer;
  const monoOptions = !!b.code;
  return (
    <Panel>
      <T w={500} size={15}>
        {b.question}
      </T>
      {b.code && (
        <View style={{ padding: 14, borderRadius: 12, backgroundColor: t.codeBg }}>
          <Mono>{b.code}</Mono>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {b.options.map((opt, i) => {
          const chosen = picked === i;
          const showRight = picked !== null && i === b.answer;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => setPicked(i)}
              style={{
                flexBasis: '47%',
                flexGrow: 1,
                minHeight: 52,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: showRight || chosen ? 1.5 : 1,
                borderColor: showRight ? a.color : chosen ? t.muted : t.btnLine,
                backgroundColor: showRight ? a.wash : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Text style={{ fontFamily: monoOptions ? fonts.mono : fonts.body, fontSize: 15, color: chosen || showRight ? t.text : t.muted, textAlign: 'center' }}>{opt}</Text>
              {showRight && <Icon name="check" size={16} color={a.color} stroke={2.2} />}
            </Pressable>
          );
        })}
      </View>
      {picked !== null && (
        <T size={14} color={t.body} style={{ lineHeight: 21 }}>
          <T w={600} size={14} color={right ? a.color : t.text}>
            {right ? 'Right. ' : 'Not quite. '}
          </T>
          {b.explain}
        </T>
      )}
    </Panel>
  );
}

function Chart({ b, kind }: { b: Extract<Block, { type: 'chart' }>; kind: CardKind }) {
  const { t, mode } = useTheme();
  const a = accent(kind, mode);
  const W = 300;
  const H = 140;
  const max = Math.max(...b.points);
  const min = b.kind === 'bar' ? 0 : Math.min(...b.points);
  const y = (v: number) => H - 8 - ((v - min) / (max - min || 1)) * (H - 16);
  return (
    <Panel gap={10}>
      {b.title && (
        <T w={500} size={14} color={t.muted}>
          {b.title}
        </T>
      )}
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {b.kind === 'line' ? (
          <Path
            d={b.points.map((v, i) => `${i ? 'L' : 'M'}${(i / (b.points.length - 1)) * W},${y(v)}`).join(' ')}
            stroke={a.color}
            strokeWidth={2.5}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : (
          b.points.map((v, i) => {
            const bw = W / b.points.length;
            return <Rect key={i} x={i * bw + bw * 0.18} y={y(v)} width={bw * 0.64} height={H - 8 - y(v)} rx={4} fill={a.color} opacity={i === b.points.length - 1 ? 1 : 0.55} />;
          })
        )}
      </Svg>
      {b.labels && (
        <View style={{ flexDirection: 'row' }}>
          {b.labels.map((l, i) => (
            <T key={i} size={12} color={t.faint} style={{ flex: 1, textAlign: 'center' }}>
              {l}
            </T>
          ))}
        </View>
      )}
      {b.caption && (
        <T size={13} color={t.muted} style={{ lineHeight: 19 }}>
          {b.caption}
        </T>
      )}
    </Panel>
  );
}

export function BlockView({ b, kind }: { b: Block; kind: CardKind }) {
  const { t, mode } = useTheme();
  const a = accent(kind, mode);
  switch (b.type) {
    case 'heading':
      return <Serif size={26}>{b.text}</Serif>;
    case 'text':
      return (
        <T size={17} color={t.body} style={{ lineHeight: 27 }}>
          {b.text}
        </T>
      );
    case 'code':
      return (
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: mode === 'light' ? t.card : t.codeBg, borderWidth: 1, borderColor: t.cardLine }}>
          <Mono>{b.code}</Mono>
        </View>
      );
    case 'callout':
      return (
        <View style={{ flexDirection: 'row', gap: 14, padding: 18, borderRadius: 18, backgroundColor: a.wash, borderWidth: 1, borderColor: a.soft }}>
          <View style={{ marginTop: 2 }}>
            <Icon name="bulb" size={20} color={a.color} />
          </View>
          <T size={15} style={{ flex: 1, lineHeight: 23 }}>
            {b.label && <T w={600} size={15}>{`${b.label}. `}</T>}
            {b.text}
          </T>
        </View>
      );
    case 'diagram':
      return (
        <Panel gap={10}>
          {b.title && <Serif size={22}>{b.title}</Serif>}
          {b.rows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.faint, width: 14 }}>{i + 1}</Text>
              <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.codeBg }}>
                <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: t.text }}>{r.code}</Text>
              </View>
              <Icon name="arrow" size={20} color={t.faint} />
              {r.label ? (
                <View style={{ width: 86, borderRadius: 10, borderWidth: 1, borderColor: a.line, overflow: 'hidden', alignItems: 'center' }}>
                  <View style={{ alignSelf: 'stretch', backgroundColor: a.color, paddingVertical: 3 }}>
                    <T w={600} size={11} color={t.card} style={{ textAlign: 'center' }}>
                      {r.label}
                    </T>
                  </View>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 13, paddingVertical: 8, color: t.text }}>{r.value}</Text>
                </View>
              ) : (
                <View style={{ width: 86, height: 52, borderRadius: 10, backgroundColor: t.doneBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: t.doneFg }}>{r.value}</Text>
                </View>
              )}
            </View>
          ))}
          {b.caption && (
            <T size={13} color={t.muted} style={{ lineHeight: 19, marginTop: 6 }}>
              {b.caption}
            </T>
          )}
        </Panel>
      );
    case 'chart':
      return <Chart b={b} kind={kind} />;
    case 'chessBoard':
      return (
        <Panel gap={12}>
          <ChessBoard fen={b.fen} size={264} highlight={b.highlight} accent={a.color} />
          {b.caption && (
            <T size={13} color={t.muted} style={{ textAlign: 'center' }}>
              {b.caption}
            </T>
          )}
        </Panel>
      );
    case 'quiz':
      return <Quiz b={b} kind={kind} />;
    case 'italianPhrase':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingLeft: 18, borderRadius: 18, backgroundColor: a.wash, borderWidth: 1, borderColor: a.line }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Serif italic size={28}>
              {b.it}
            </Serif>
            <T size={13} color={t.muted}>
              {b.en}
            </T>
            {b.note && (
              <T size={12} color={t.faint}>
                {b.note}
              </T>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play pronunciation of ${b.it}`}
            onPress={() => speakItalian(b.it)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: a.color, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="speaker" size={18} color={t.card} stroke={1.9} />
          </Pressable>
        </View>
      );
  }
}
