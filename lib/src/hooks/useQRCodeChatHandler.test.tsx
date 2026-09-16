import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  handleQRChatId,
  resolveQrChatRoomJid,
  useQRCodeChat,
} from './useQRCodeChatHandler';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';

const KEY = localStorageConstants.ETHORA_QR_CHAT_ID;
const CONFERENCE = 'conference.xmpp.chat-qa.ethora.com';
const CHAT_ID = 'app1_room1';
const JID = `${CHAT_ID}@${CONFERENCE}`;

const setUrl = (url: string) => {
  window.history.replaceState({}, '', url);
};

beforeEach(() => {
  localStorage.clear();
  setUrl('/chat');
});

describe('handleQRChatId', () => {
  it('parks a qrChatId and strips it from the URL', () => {
    setUrl(`/chat?qrChatId=${CHAT_ID}`);
    handleQRChatId();
    expect(localStorage.getItem(KEY)).toBe(CHAT_ID);
    expect(window.location.search).toBe('');
  });

  it('parks a chatId too, so a QR link survives a login round trip', () => {
    // The QR modal emits `chatId`; the handler only looked for `qrChatId`,
    // so the whole park-through-login mechanism never engaged for real QRs.
    setUrl(`/chat?chatId=${CHAT_ID}`);
    handleQRChatId();
    expect(localStorage.getItem(KEY)).toBe(CHAT_ID);
  });

  it('leaves chatId in the URL for chatAutoEnterer and setRoomJidInPath', () => {
    setUrl(`/chat?chatId=${CHAT_ID}`);
    handleQRChatId();
    expect(window.location.search).toBe(`?chatId=${CHAT_ID}`);
  });

  it('keeps unrelated query params when stripping qrChatId', () => {
    setUrl(`/chat?lang=uk&qrChatId=${CHAT_ID}`);
    handleQRChatId();
    expect(window.location.search).toBe('?lang=uk');
  });

  it('does nothing when no chat id is present', () => {
    setUrl('/chat?lang=uk');
    handleQRChatId();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(window.location.search).toBe('?lang=uk');
  });
});

describe('resolveQrChatRoomJid', () => {
  it('qualifies a bare chat id with the host conference', () => {
    expect(resolveQrChatRoomJid(CHAT_ID, CONFERENCE)).toBe(JID);
  });

  it('accepts an already-qualified JID unchanged', () => {
    expect(resolveQrChatRoomJid(JID, CONFERENCE)).toBe(JID);
    expect(resolveQrChatRoomJid(JID, undefined)).toBe(JID);
  });

  it('refuses to guess a conference server', () => {
    // Multi-tenant correctness: a build-time fallback baked into the
    // published bundle would point at the wrong tenant (or produce `id@`).
    expect(resolveQrChatRoomJid(CHAT_ID, undefined)).toBe('');
    expect(resolveQrChatRoomJid(CHAT_ID, '   ')).toBe('');
  });

  it('rejects a malformed JID', () => {
    expect(resolveQrChatRoomJid('room@', CONFERENCE)).toBe('');
    expect(resolveQrChatRoomJid('', CONFERENCE)).toBe('');
  });
});

describe('useQRCodeChat', () => {
  it('selects the parked room and clears the id once the room lands', () => {
    localStorage.setItem(KEY, CHAT_ID);
    const setCurrentRoom = vi.fn();

    const { rerender } = renderHook(
      ({ rooms, activeRoomJID }) =>
        useQRCodeChat(setCurrentRoom, CONFERENCE, {
          rooms,
          activeRoomJID,
          isReady: false,
        }),
      { initialProps: { rooms: {} as Record<string, unknown>, activeRoomJID: null as string | null } }
    );

    expect(setCurrentRoom).toHaveBeenCalledWith({ roomJID: JID });
    // Still parked: the room has not actually arrived yet.
    expect(localStorage.getItem(KEY)).toBe(CHAT_ID);

    rerender({ rooms: { [JID]: { jid: JID } }, activeRoomJID: JID });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('re-asserts the room when something else steals the selection', () => {
    // The id used to be consumed and deleted on mount, before login and
    // before any room existed, so anything that selected a room afterwards
    // silently won and the link opened a different chat with no recovery.
    localStorage.setItem(KEY, CHAT_ID);
    const setCurrentRoom = vi.fn();

    const { rerender } = renderHook(
      ({ activeRoomJID }) =>
        useQRCodeChat(setCurrentRoom, CONFERENCE, {
          rooms: {},
          activeRoomJID,
          isReady: false,
        }),
      { initialProps: { activeRoomJID: null as string | null } }
    );

    setCurrentRoom.mockClear();
    rerender({ activeRoomJID: 'someone_else@conference.xmpp.chat-qa.ethora.com' });
    expect(setCurrentRoom).toHaveBeenCalledWith({ roomJID: JID });
  });

  it('holds the parked id until the selection settles on the right room', () => {
    // The room being in the list is not enough - the selection can still be
    // stolen afterwards (a cache-scope reset that nulls the active room,
    // then a room-discovery stanza defaulting to whichever room arrived
    // first). Letting go early left no way back to the requested room.
    localStorage.setItem(KEY, CHAT_ID);
    const setCurrentRoom = vi.fn();

    const { rerender } = renderHook(
      ({ activeRoomJID }) =>
        useQRCodeChat(setCurrentRoom, CONFERENCE, {
          rooms: { [JID]: { jid: JID } },
          activeRoomJID,
          isReady: false,
        }),
      { initialProps: { activeRoomJID: 'other@conference.xmpp.chat-qa.ethora.com' as string | null } }
    );

    expect(localStorage.getItem(KEY)).toBe(CHAT_ID);

    rerender({ activeRoomJID: JID });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('waits instead of guessing while the conference server is unknown', () => {
    localStorage.setItem(KEY, CHAT_ID);
    const setCurrentRoom = vi.fn();

    const { rerender } = renderHook(
      ({ conference }) =>
        useQRCodeChat(setCurrentRoom, conference, {
          rooms: {},
          activeRoomJID: null,
          isReady: true,
        }),
      { initialProps: { conference: undefined as string | undefined } }
    );

    expect(setCurrentRoom).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe(CHAT_ID);

    rerender({ conference: CONFERENCE });
    expect(setCurrentRoom).toHaveBeenCalledWith({ roomJID: JID });
  });

  it('gives up and reports the room once the list has settled without it', () => {
    localStorage.setItem(KEY, CHAT_ID);
    const setCurrentRoom = vi.fn();

    const { result } = renderHook(() =>
      useQRCodeChat(setCurrentRoom, CONFERENCE, {
        rooms: { 'other@conference.xmpp.chat-qa.ethora.com': {} },
        activeRoomJID: null,
        isReady: true,
      })
    );

    expect(result.current.notFoundRoomJID).toBe(JID);
    // Cleared, so the next reload does not yank the user back here forever.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('does nothing at all when no id was parked', () => {
    const setCurrentRoom = vi.fn();
    const { result } = renderHook(() =>
      useQRCodeChat(setCurrentRoom, CONFERENCE, {
        rooms: {},
        activeRoomJID: null,
        isReady: true,
      })
    );
    expect(setCurrentRoom).not.toHaveBeenCalled();
    expect(result.current.wasAutoSelected).toBe(false);
    expect(result.current.notFoundRoomJID).toBeNull();
  });
});
