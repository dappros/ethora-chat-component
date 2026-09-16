import { describe, expect, it, beforeEach, vi } from 'vitest';
import { chatAutoEnterer } from './chatAutoEnterer';
import type { AppDispatch } from '../roomStore';

const CONFERENCE = 'conference.xmpp.chat-qa.ethora.com';
const CHAT_ID = 'app1_room1';

const setUrl = (url: string) => window.history.replaceState({}, '', url);

beforeEach(() => {
  localStorage.clear();
  setUrl('/chat');
});

const run = (args: {
  roomJID?: string;
  wasAutoSelected?: boolean;
  conference?: string;
}) => {
  const dispatch = vi.fn() as unknown as AppDispatch;
  chatAutoEnterer({
    roomJID: args.roomJID,
    wasAutoSelected: args.wasAutoSelected ?? false,
    config: { xmppSettings: { conference: args.conference } },
    dispatch,
  });
  return dispatch as unknown as ReturnType<typeof vi.fn>;
};

describe('chatAutoEnterer', () => {
  it('opens the room from a chatId query param', () => {
    setUrl(`/chat?chatId=${CHAT_ID}`);
    const dispatch = run({ conference: CONFERENCE });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { roomJID: `${CHAT_ID}@${CONFERENCE}` },
      })
    );
  });

  it('never builds a JID without a conference server', () => {
    // It used to default the conference to '' and dispatch `<chatId>@`,
    // selecting a room that cannot exist and leaving the pane blank.
    setUrl(`/chat?chatId=${CHAT_ID}`);
    const dispatch = run({ conference: undefined });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('accepts a chatId that is already a full JID', () => {
    const jid = `${CHAT_ID}@${CONFERENCE}`;
    setUrl(`/chat?chatId=${encodeURIComponent(jid)}`);
    const dispatch = run({ conference: CONFERENCE });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { roomJID: jid } })
    );
  });

  it('lets an explicit roomJID prop win over the URL', () => {
    setUrl(`/chat?chatId=${CHAT_ID}`);
    const forced = `forced@${CONFERENCE}`;
    const dispatch = run({ roomJID: forced, conference: CONFERENCE });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { roomJID: forced } })
    );
  });

  it('stands down when the QR hook already selected a room', () => {
    setUrl(`/chat?chatId=${CHAT_ID}`);
    const dispatch = run({ wasAutoSelected: true, conference: CONFERENCE });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('parks a push messageId alongside the resolved room', () => {
    setUrl(`/chat?chatId=${CHAT_ID}&messageId=42`);
    run({ conference: CONFERENCE });
    expect(localStorage.getItem('@ethora/chat-component-pushMessageId')).toBe('42');
    expect(localStorage.getItem('@ethora/chat-component-pushRoomJid')).toBe(
      `${CHAT_ID}@${CONFERENCE}`
    );
  });
});
