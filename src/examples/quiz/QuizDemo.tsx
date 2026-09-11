import React, { useCallback, useMemo, useRef } from 'react';
import { ReduxWrapper } from '../../components/MainComponents/ReduxWrapper';
import { IConfig } from '../../types/types';
import { DEFAULT_QUIZ_SCRIPT } from './quizScript';
import { useQuizFlow } from './useQuizFlow';
import { useDemoSession } from './useDemoSession';

/**
 * Demo route for bot buttons ("quick replies") and the scripted flow they
 * make possible.
 *
 * What belongs to the SDK, and what does not, is the point of this page:
 *
 *   ENGINE  a message whose <data> carries `quickReplies` renders its
 *           buttons under the bubble; tapping one sends that button's value
 *           into the room as an ordinary message and fires
 *           `config.eventHandlers.onQuickReply`.
 *   HOST    the script, the order of the steps, where the answers pile up.
 *           All of it is in ./useQuizFlow + ./quizScript, none of it in the
 *           engine. On a real deployment this half moves to the bot, which
 *           sends the same stanzas over XMPP - the bubble cannot tell the
 *           difference, which is exactly why the demo is honest.
 *
 * Press "Connect a demo visitor" (no credentials needed - it borrows the
 * embeddable assistant's anonymous session endpoint), then "Start quiz". It
 * also works against an already signed-in session: skip the first button and
 * open any room.
 */

const BOT = {
  id: 'quiz-demo-bot',
  name: 'Quiz Bot',
};

const panelStyle: React.CSSProperties = {
  width: 340,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  background: '#fff',
  border: '1px solid #E4E4E7',
  borderRadius: 8,
  overflowY: 'auto',
  fontSize: 13,
  lineHeight: 1.5,
};

const QuizDemo: React.FC = () => {
  const script = useMemo(() => DEFAULT_QUIZ_SCRIPT, []);
  const { session, connect, loading, error } = useDemoSession();
  const {
    onQuickReply,
    start,
    answers,
    isRunning,
    roomJID,
    awaitingTypedAnswer,
  } = useQuizFlow(script, BOT);

  // The handler is read through a ref so the config object below stays
  // referentially stable: rebuilding it on every answer would remount the
  // chat (and drop the XMPP connection) mid-flow.
  const onQuickReplyRef = useRef(onQuickReply);
  onQuickReplyRef.current = onQuickReply;
  const stableOnQuickReply = useCallback(
    (event: any) => onQuickReplyRef.current(event),
    []
  );

  const config = useMemo<IConfig>(
    () => ({
      refreshTokens: { enabled: true },
      disableMedia: false,
      eventHandlers: {
        // The only wiring the engine needs. Fires AFTER the tapped answer
        // has been sent into the room.
        onQuickReply: stableOnQuickReply,
      },
      // Everything below is just "how this page gets a room to talk in", and
      // is absent when the host already has a signed-in user.
      ...(session
        ? {
            appId: session.appId,
            baseUrl: session.baseUrl,
            userLogin: { enabled: true, user: session.user },
            xmppSettings: session.xmppSettings,
            defaultRooms: [{ jid: session.roomJID, pinned: true }],
            // The demo visitor has exactly one room, so the room list is
            // dead space - and the conversation is what this page is about.
            disableRooms: true,
          }
        : { setRoomJidInPath: true }),
    }),
    [stableOnQuickReply, session]
  );

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        height: 'calc(100svh - 40px)',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <ReduxWrapper
          key={session?.roomJID || 'signed-in'}
          {...(session ? { roomJID: session.roomJID } : {})}
          config={config}
          MainComponentStyles={{
            height: '100%',
            borderRadius: '8px',
            border: '1px solid #E4E4E7',
            overflow: 'hidden',
          }}
        />
      </div>

      <aside style={panelStyle}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Quiz demo</div>
          <div style={{ color: '#71717A' }}>
            The questions and their buttons appear in the chat, in the bot's
            own bubbles. This panel only starts the flow and shows what has
            been collected.
          </div>
        </div>

        {!session && (
          <button
            type="button"
            onClick={connect}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #0052CD',
              background: '#fff',
              color: '#0052CD',
              cursor: loading ? 'default' : 'pointer',
              fontSize: 13,
            }}
          >
            {loading ? 'Connecting...' : 'Connect a demo visitor'}
          </button>
        )}

        {error && (
          <div style={{ color: '#B91C1C' }}>Could not connect: {error}</div>
        )}

        <button
          type="button"
          onClick={start}
          disabled={!roomJID}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: 'none',
            background: roomJID ? '#0052CD' : '#D4D4D8',
            color: '#fff',
            cursor: roomJID ? 'pointer' : 'default',
            fontSize: 13,
          }}
        >
          {isRunning ? 'Restart quiz' : 'Start quiz'}
        </button>

        {!roomJID && (
          <div style={{ color: '#B45309' }}>
            No active room yet. Either connect a demo visitor above, or sign
            in and open a chat - the questions go into whichever room is open.
          </div>
        )}

        {awaitingTypedAnswer && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              background: '#EFF6FF',
              color: '#1D4ED8',
            }}
          >
            This step has no buttons. Type the answer in the composer - the
            flow reads your next message.
          </div>
        )}

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Answers ({answers.length}/{script.filter((s) => s.type !== 'say').length})
          </div>
          {answers.length === 0 ? (
            <div style={{ color: '#A1A1AA' }}>Nothing collected yet.</div>
          ) : (
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              {answers.map((answer) => (
                <li key={answer.stepId} style={{ marginBottom: 6 }}>
                  <div style={{ color: '#71717A' }}>{answer.question}</div>
                  <div>
                    <strong>{answer.answer}</strong>{' '}
                    <span style={{ color: '#A1A1AA', fontSize: 11 }}>
                      via {answer.via}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div style={{ color: '#A1A1AA', fontSize: 11 }}>
          Every answer, tapped or typed, is a real message in the room - so a
          bot reads it through the same path as anything else the user says,
          and it is already in the transcript.
        </div>
      </aside>
    </div>
  );
};

export default QuizDemo;
