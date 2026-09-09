import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState, store } from '../../roomStore';
import { addRoomMessage } from '../../roomStore/roomsSlice';
import { QuizStep, optionsForStep } from './quizScript';

/**
 * Drives a scripted question flow on top of the engine's two primitives:
 *
 *   1. a bot message carrying `quickReplies` renders buttons under the
 *      bubble;
 *   2. tapping one sends that button's value into the room as an ordinary
 *      message, and calls `config.eventHandlers.onQuickReply`.
 *
 * The flow itself lives here, in host code. In production the same script
 * would run on the bot: it would send the questions over XMPP instead of
 * this hook injecting them into the store, and nothing in the engine or in
 * the bubble would change.
 *
 * Steps that ask for free text have no buttons, so their answer arrives as
 * an ordinary typed message. We watch the room for the user's own new
 * messages to catch those - see the subscription below.
 */

export interface QuizAnswer {
  stepId: string;
  question: string;
  answer: string;
  /** How the answer was given, which is the interesting half of the demo. */
  via: 'button' | 'typed';
}

export interface QuizBotIdentity {
  id: string;
  name: string;
  avatar?: string;
}

/** Every step lands one beat after whatever asked for it. See below. */
const STEP_DELAY_MS = 500;

const QUIZ_MESSAGE_PREFIX = 'quiz-demo:';

const stepMessageId = (roomJID: string, index: number) =>
  `${QUIZ_MESSAGE_PREFIX}${roomJID}:${index}`;

const isQuizMessageId = (id: unknown): boolean =>
  typeof id === 'string' && id.startsWith(QUIZ_MESSAGE_PREFIX);

const timestampOf = (message: any): number => {
  const raw =
    message?.messageTimestampMs ??
    message?.timestamp ??
    (message?.date ? Date.parse(message.date) : NaN);
  return Number.isFinite(raw) ? Number(raw) : Date.now();
};

export function useQuizFlow(script: QuizStep[], bot: QuizBotIdentity) {
  const roomJID = useSelector((state: RootState) => state.rooms.activeRoomJID);
  const xmppUsername = useSelector(
    (state: RootState) => state.chatSettingStore.user?.xmppUsername || ''
  );

  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [stepIndex, setStepIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);

  // The typed-answer watcher is a plain store subscription (not React state)
  // so it can read the live values without being re-created on every render.
  const waitingForTypedRef = useRef<{ index: number; since: number } | null>(
    null
  );
  const scriptRef = useRef(script);
  const botRef = useRef(bot);
  const roomRef = useRef(roomJID);
  scriptRef.current = script;
  botRef.current = bot;
  roomRef.current = roomJID;

  const injectBotMessage = useCallback(
    (id: string, body: string, buttons?: unknown) => {
      const room = roomRef.current;
      if (!room) return;
      const now = Date.now();
      store.dispatch(
        addRoomMessage({
          roomJID: room,
          message: {
            id,
            body,
            roomJid: room,
            messageTimestampMs: now,
            date: new Date(now).toISOString(),
            timestamp: now,
            user: {
              id: botRef.current.id,
              name: botRef.current.name,
              profileImage: botRef.current.avatar || '',
            },
            // Not pending: a pending bubble renders the "sending" clock, and
            // this message is never going anywhere, so it would never clear.
            pending: false,
            // The wire format a real bot would stamp on its stanza. Passing
            // the JSON string rather than the array on purpose: it proves
            // the bubble decodes exactly what arrives over XMPP.
            ...(buttons ? { quickReplies: JSON.stringify(buttons) } : {}),
          } as any,
          start: false,
        } as any)
      );
    },
    []
  );

  const finish = useCallback(
    (collected: QuizAnswer[]) => {
      const room = roomRef.current;
      const summary = collected
        .map((a, i) => `${i + 1}. ${a.question} **${a.answer}**`)
        .join('\n');
      injectBotMessage(
        `${QUIZ_MESSAGE_PREFIX}${room}:done`,
        `Thanks, that is everything. Here is what I have:\n\n${summary}\n\nAsk me anything else in the meantime.`
      );
      waitingForTypedRef.current = null;
      setIsRunning(false);
      setStepIndex(-1);
    },
    [injectBotMessage]
  );

  // Declared as a ref-held function so `ask` and `goTo` can recurse through
  // each other without a circular useCallback dependency.
  const goToRef = useRef<(index: number, collected: QuizAnswer[]) => void>();

  const ask = useCallback(
    (index: number, collected: QuizAnswer[]) => {
      const step = scriptRef.current[index];
      const room = roomRef.current;
      if (!step || !room) return;

      const options = optionsForStep(step);
      injectBotMessage(
        stepMessageId(room, index),
        step.text,
        options.length
          ? options.map((option) => ({
              name: option.name,
              value: option.value,
              questionId: step.id,
            }))
          : undefined
      );
      setStepIndex(index);

      if (step.type === 'input') {
        // Hand this step to the composer: the user's next message is the
        // answer. `since` guards against a late echo of an EARLIER message
        // being mistaken for this step's answer.
        waitingForTypedRef.current = { index, since: Date.now() };
        return;
      }

      waitingForTypedRef.current = null;

      // A `say` step has nothing to answer, so it walks on by itself.
      if (step.type === 'say') {
        goToRef.current?.(index + 1, collected);
      }
    },
    [injectBotMessage]
  );

  const goTo = useCallback(
    (index: number, collected: QuizAnswer[]) => {
      // The delay is not only pacing: the user's own answer is an optimistic
      // message stamped at click time, so a question injected synchronously
      // ties with it and can sort ABOVE the answer that triggered it.
      setTimeout(() => {
        if (index < scriptRef.current.length) {
          ask(index, collected);
        } else {
          finish(collected);
        }
      }, STEP_DELAY_MS);
    },
    [ask, finish]
  );
  goToRef.current = goTo;

  const record = useCallback(
    (index: number, answer: string, via: QuizAnswer['via']) => {
      const step = scriptRef.current[index];
      if (!step) return;
      setAnswers((previous) => {
        const next = [
          ...previous,
          {
            stepId: step.id,
            question: step.label || step.text,
            answer,
            via,
          },
        ];
        goTo(index + 1, next);
        return next;
      });
    },
    [goTo]
  );

  /** Wire this into `config.eventHandlers.onQuickReply`. */
  const onQuickReply = useCallback(
    (event: { messageId: string; questionId: string; reply: { value: string } }) => {
      if (!isQuizMessageId(event.messageId)) return;
      const index = Number(
        event.messageId.slice(event.messageId.lastIndexOf(':') + 1)
      );
      if (!Number.isInteger(index)) return;
      record(index, event.reply.value, 'button');
    },
    [record]
  );

  const start = useCallback(() => {
    if (!roomRef.current) return;
    setAnswers([]);
    setIsRunning(true);
    goTo(0, []);
  }, [goTo]);

  // Typed answers. A store subscription rather than an engine hook on
  // purpose: the message is already sent and stored by the time we see it,
  // so nothing here can interfere with delivery. Worst case the flow misses
  // an answer; the conversation itself is untouched.
  useEffect(() => {
    if (!roomJID || !xmppUsername) return;

    const seen = new Set<string>();
    const snapshot = () => {
      const room = (store.getState() as any)?.rooms?.rooms?.[roomJID];
      for (const message of room?.messages ?? []) {
        if (message?.id) seen.add(String(message.id));
      }
    };
    snapshot();

    const isOwnMessage = (message: any): boolean => {
      if (!message || isQuizMessageId(message.id)) return false;
      if (message.isSystemMessage === true || message.isSystemMessage === 'true') {
        return false;
      }
      const senderId = String(message.user?.id || '');
      // A sender id arrives either bare or as a full JID.
      return senderId === xmppUsername || senderId.split('@')[0] === xmppUsername;
    };

    return store.subscribe(() => {
      const room = (store.getState() as any)?.rooms?.rooms?.[roomJID];
      for (const message of room?.messages ?? []) {
        const id = message?.id ? String(message.id) : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);

        // Marked seen before this check on purpose: a message that arrives
        // while no step is waiting must never be replayed into a later one.
        const waiting = waitingForTypedRef.current;
        if (!waiting) continue;
        if (!isOwnMessage(message)) continue;
        if (timestampOf(message) < waiting.since) continue;

        const body = String(message.body ?? '').trim();
        if (!body) continue;

        waitingForTypedRef.current = null;
        record(waiting.index, body, 'typed');
      }
    });
  }, [roomJID, xmppUsername, record]);

  const currentStep = useMemo(
    () => (stepIndex >= 0 ? script[stepIndex] : undefined),
    [script, stepIndex]
  );

  return {
    onQuickReply,
    start,
    answers,
    isRunning,
    currentStep,
    stepIndex,
    roomJID,
    /** True while the composer is standing in for this step's buttons. */
    awaitingTypedAnswer: currentStep?.type === 'input' && isRunning,
  };
}
