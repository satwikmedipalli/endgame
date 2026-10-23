import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlockView } from '@/components/Blocks';
import { Icon } from '@/components/Icon';
import { DoneButton, OutlineButton, Serif, T } from '@/components/ui';
import { isLessonCourse } from '@/lib/course';
import { discussLink } from '@/lib/discuss';
import type { Card } from '@/lib/types';
import { useFeed } from '@/store/FeedStore';
import { useHelper } from '@/store/Helper';
import { requestAdvance } from '@/store/nav';
import { useTheme } from '@/theme/ThemeProvider';
import { accent, fonts, KIND_LABEL } from '@/theme/tokens';

const NOUN: Partial<Record<Card['kind'], string>> = { history: 'story', watch: 'pitch' };
/** Cards whose content the Mac writes when you tap: lessons, history stories, watch pitches. */
const writtenOnTap = (c: Card) => !c.blocks.length && (isLessonCourse(c.course) || c.kind === 'history');
const isBook = (c: Card) => c.tag.startsWith('Book');

/** A card before its content exists: opening it is the Explain tap, so ask the Mac once. */
function LessonPending({ card }: { card: Card }) {
  const { t, mode } = useTheme();
  const { userId } = useFeed();
  const { online, explain, lessons } = useHelper();
  const a = accent(card.kind, mode);
  const job = lessons[card.id];
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || job || !userId) return;
    asked.current = true;
    explain(card.id);
  }, [job, userId, explain, card.id]);

  const failed = job?.status === 'failed';
  const noun = NOUN[card.kind] ?? 'lesson';
  const text = !userId
    ? `The ${noun} is written by your Mac. Sign in to use it.`
    : failed
      ? `The ${noun} couldn't be written: ${job.error ?? 'unknown error'}`
      : job?.status === 'done'
        ? 'Done. Loading it…'
        : !online
          ? `Your Mac is off. The ${noun} gets written as soon as it is on, and appears here.`
          : job?.status === 'running'
            ? `Writing the ${noun} on your Mac. This takes a minute or so.`
            : 'Sent to your Mac…';
  return (
    <View style={{ gap: 16, padding: 18, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine }}>
      {card.kind !== 'watch' && (
        <T size={16} color={t.body} style={{ lineHeight: 24 }}>
          {card.hook}
        </T>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {!failed && userId && <ActivityIndicator color={a.color} />}
        <T size={14} color={t.muted} style={{ flex: 1, lineHeight: 20 }}>
          {text}
        </T>
      </View>
      {failed && <OutlineButton label="Try again" onPress={() => explain(card.id)} />}
    </View>
  );
}

/** Optional one line after a rating; it goes into your taste profile word for word. */
function RatingComment({ card }: { card: Card }) {
  const { t } = useTheme();
  const { patch } = useFeed();
  const [text, setText] = useState(card.watch?.comment ?? '');
  const save = () => text.trim() !== (card.watch?.comment ?? '') && patch(card.id, { watch: { ...card.watch!, comment: text.trim() || undefined } });
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={save}
      onSubmitEditing={save}
      maxLength={140}
      placeholder="One line about it (optional)"
      placeholderTextColor={t.faint}
      accessibilityLabel="Comment on this title"
      returnKeyType="done"
      style={{ height: 48, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: t.btnLine, fontFamily: fonts.body, fontSize: 15, color: t.text, outlineStyle: 'none' } as never}
    />
  );
}

/** Italian is capped at 10 minutes a day: a quiet countdown, then a nudge to stop. */
const ITALIAN_MINUTES = 10;
function ItalianTimer() {
  const { t } = useTheme();
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, ITALIAN_MINUTES * 60 - Math.floor((now - start) / 1000));
  return (
    <T size={13} color={left ? t.muted : t.text} w={left ? 400 : 600} style={{ fontVariant: ['tabular-nums'] }}>
      {left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left of today’s 10 minutes` : 'That’s your 10 minutes. Press DONE; the rest can wait for tomorrow.'}
    </T>
  );
}

function WatchFlow({ card }: { card: Card }) {
  const { t, mode } = useTheme();
  const { patch, mark } = useFeed();
  const a = accent('watch', mode);
  const stage = card.watch?.stage ?? 'teaser';

  const choice = (label: string, onPress: () => void, solid = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{ flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: solid ? a.color : 'transparent', borderWidth: solid ? 0 : 1, borderColor: t.btnLine }}
    >
      <T w={600} size={15} color={solid ? t.card : t.text}>
        {label}
      </T>
    </Pressable>
  );

  if (stage === 'followup' || stage === 'rated') {
    return (
      <View style={{ gap: 14 }}>
        <T size={15} color={t.muted}>
          {stage === 'rated' ? `You rated it ${card.watch?.rating}/10.` : `Did you ${isBook(card) ? 'read' : 'watch'} it? Tap a rating, or Skip if you haven't yet.`}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const on = card.watch?.rating === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n} out of 10`}
                onPress={() => {
                  patch(card.id, { watch: { ...card.watch, stage: 'rated', rating: n } });
                  mark(card.id, 'done');
                }}
                style={{ width: 52, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? a.color : 'transparent', borderWidth: on ? 0 : 1, borderColor: t.btnLine }}
              >
                <T w={600} size={16} color={on ? t.card : t.text}>
                  {n}
                </T>
              </Pressable>
            );
          })}
        </View>
        {stage === 'rated' && <RatingComment card={card} />}
      </View>
    );
  }

  if (stage === 'teaser') {
    return (
      <View style={{ gap: 14 }}>
        <T size={17} color={t.body} style={{ lineHeight: 27 }}>
          {card.hook}
        </T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {choice('Not for me', () => mark(card.id, 'skip'))}
          {choice('Interested', () => patch(card.id, { watch: { stage: 'pitch' } }), true)}
        </View>
      </View>
    );
  }

  // Interested: the pitch is written now, on your Mac, unless it already exists.
  if (!card.blocks.length) return <LessonPending card={card} />;

  const verb = isBook(card) ? 'read' : 'watch';
  return (
    <View style={{ gap: 28 }}>
      {card.blocks.map((b, i) => (
        <BlockView key={i} b={b} kind="watch" />
      ))}
      <Serif size={26}>Will you {verb} it?</Serif>
      {stage === 'decided' ? (
        <T size={15} color={t.muted}>
          {card.watch?.willWatch ? `Noted. Tomorrow you'll get a quick “Did you ${verb} it?”.` : 'Noted. It will not come back.'}
        </T>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {choice('No', () => patch(card.id, { watch: { stage: 'decided', willWatch: false } }))}
          {choice('Yes', () => patch(card.id, { watch: { stage: 'decided', willWatch: true } }), true)}
        </View>
      )}
    </View>
  );
}

function Chat({ card }: { card: Card }) {
  const { t, mode } = useTheme();
  const { ask, thinking, online } = useHelper();
  const a = accent(card.kind, mode);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const waiting = thinking.has(card.id);

  // Opens Claude on this card through the Endgame connector (works with the Mac off).
  const discuss = async () => {
    const { url, copy } = discussLink(card);
    if (copy) setCopied(await Clipboard.setStringAsync(copy).catch(() => false));
    Linking.openURL(url);
  };

  const send = (msg: string) => {
    const m = msg.trim();
    if (!m || waiting) return;
    ask(card.id, m);
    setText('');
  };

  return (
    <View style={{ gap: 12 }}>
      <Serif size={26}>Ask anything</Serif>
      {card.chat.map((m, i) =>
        m.role === 'system' ? (
          <T key={i} size={12} color={t.faint} style={{ alignSelf: 'center', textAlign: 'center' }}>
            {m.text}
          </T>
        ) : (
          <View
            key={i}
            style={
              m.role === 'user'
                ? { alignSelf: 'flex-end', maxWidth: '80%', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: t.doneBg }
                : { alignSelf: 'flex-start', maxWidth: '88%', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderBottomLeftRadius: 6, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine }
            }
          >
            <T size={15} color={m.role === 'user' ? t.doneFg : t.text} style={{ lineHeight: 22 }}>
              {m.text}
            </T>
          </View>
        ),
      )}
      {waiting && (
        <View style={{ alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderBottomLeftRadius: 6, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine }}>
          <T size={15} color={t.muted}>
            Thinking on your Mac…
          </T>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {(card.kind === 'italian' ? ['Chat with me in Italian', 'Simplify'] : ['Simplify', 'Another example']).map((chip) => (
          <OutlineButton key={chip} label={chip} height={36} size={13} onPress={() => send(chip)} style={{ borderRadius: 999 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, paddingLeft: 16, borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.btnLine }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => send(text)}
          placeholder={card.kind === 'news' ? 'Ask about this story…' : 'Ask about this lesson…'}
          placeholderTextColor={t.faint}
          accessibilityLabel="Ask a question"
          returnKeyType="send"
          style={{ flex: 1, minWidth: 0, height: 40, fontFamily: fonts.body, fontSize: 15, color: t.text, outlineStyle: 'none' } as never}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => send(text)} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: a.color, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="send" size={18} color={t.card} stroke={2} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="link" onPress={discuss} style={{ alignSelf: 'center', paddingVertical: 10, alignItems: 'center', gap: 4 }}>
        <T size={13} color={a.color}>
          {online ? 'Discuss in Claude →' : 'Mac offline? Discuss in Claude →'}
        </T>
        {copied && (
          <T size={12} color={t.faint}>
            Prompt copied. Paste it in Claude.
          </T>
        )}
      </Pressable>
    </View>
  );
}

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { today, mark, opened } = useFeed();
  const { online } = useHelper();
  const [readPct, setReadPct] = useState(0);
  const card = today?.cards.find((c) => c.id === id);

  useEffect(() => {
    if (card && !card.openedAt) opened(card.id);
  }, [card, opened]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <T color={t.muted}>This card is not in today&apos;s feed.</T>
        <OutlineButton label="Back to feed" onPress={back} />
      </View>
    );
  }

  const a = accent(card.kind, mode);
  const finish = (status: 'done' | 'skip') => {
    mark(card.id, status);
    requestAdvance(card.id);
    back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to feed" onPress={back} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="back" size={18} color={t.text} stroke={1.9} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: online ? t.ok : t.faint }} />
          <T size={12} color={t.muted}>
            {online ? 'Mac connected' : 'Mac offline'}
          </T>
        </View>
      </View>
      <View style={{ height: 2, marginHorizontal: 16, borderRadius: 2, backgroundColor: t.sqIdle }}>
        <View style={{ width: `${Math.round(readPct * 100)}%`, height: 2, borderRadius: 2, backgroundColor: a.color }} />
      </View>

      <ScrollView
        contentContainerStyle={{ gap: 28, paddingTop: 26, paddingHorizontal: 20, paddingBottom: 40 }}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const max = contentSize.height - layoutMeasurement.height;
          setReadPct(max > 0 ? Math.min(1, Math.max(0, contentOffset.y / max)) : 1);
        }}
      >
        <View style={{ gap: 12 }}>
          <T w={600} size={13} color={a.color}>
            {KIND_LABEL[card.kind]} · {card.tag}
          </T>
          <Serif size={40} style={{ lineHeight: 42 }}>
            {card.title}
          </Serif>
          {card.continued && (
            <T size={13} color={t.muted}>
              Continued from yesterday. Your chat is below.
            </T>
          )}
          {card.kind === 'italian' && <ItalianTimer />}
        </View>

        {card.kind === 'watch' ? (
          <WatchFlow card={card} />
        ) : writtenOnTap(card) ? (
          <LessonPending card={card} />
        ) : (
          card.blocks.map((b, i) => <BlockView key={i} b={b} kind={card.kind} cardId={card.id} />)
        )}

        {card.kind === 'stocks' && (
          <T size={12} color={t.faint}>
            Education, not financial advice.
          </T>
        )}

        {card.kind !== 'watch' && <Chat card={card} />}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 18, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 18) + 8, borderTopWidth: 1, borderTopColor: t.cardLine }}>
        <OutlineButton label="Skip" onPress={() => finish('skip')} style={{ flex: 1 }} />
        <DoneButton onPress={() => finish('done')} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}
