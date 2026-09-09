import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resendMessage } from './resendMessage';
import { setGlobalXmppClient } from './clientRegistry';
import { store } from '../roomStore';
import {
  addRoom,
  addRoomMessage,
  setMessageSendFailed,
} from '../roomStore/roomsSlice';
import { addMessageToHeap, clearHeap } from '../roomStore/roomHeapSlice';
import { setConfig, setUser } from '../roomStore/chatSettingsSlice';
import {
  clearAllSendFailureWatchdogs,
  SEND_FAILURE_TIMEOUT_MS,
  isMessageMarkedFailed,
} from '../helpers/sendFailureWatchdog';

// sendMessage's client id is positional argument 10; `mentions` follows it,
// so reading the last argument would pick up the spans instead of the id.
const SEND_MESSAGE_ID_ARG = 10;

const ROOM_JID = 'retry-room@conference.example.com';
const MESSAGE_ID = 'send-text-message-abc';

/**
 * A send that never settles: exactly what `sendMessage` does while the
 * socket is down (the queue entry sits there until reconnect). Retry must
 * cope with a promise that never resolves.
 */
const neverSettles = () => new Promise<boolean>(() => {});

const makeClient = (send: () => Promise<boolean> = async () => true) => ({
  sendMessage: vi.fn(send),
  sendTextMessageWithTranslateTagStanza: vi.fn(send),
  deleteMessageStanza: vi.fn(),
});

const seed = () => {
  store.dispatch(clearHeap());
  store.dispatch(
    addRoom({
      roomData: {
        jid: ROOM_JID,
        name: 'r',
        title: 'R',
        usersCnt: 0,
        messages: [],
        isLoading: false,
        roomBg: null,
      } as any,
    })
  );
  store.dispatch(
    setUser({
      xmppUsername: 'me',
      firstName: 'Me',
      lastName: 'Myself',
      walletAddress: 'w',
    } as any)
  );
  store.dispatch(setConfig({ eventHandlers: {} } as any));
  store.dispatch(
    addRoomMessage({
      roomJID: ROOM_JID,
      message: {
        id: MESSAGE_ID,
        body: 'hello',
        date: new Date().toISOString(),
        roomJid: ROOM_JID,
        user: { id: 'me', name: 'Me Myself' },
        pending: true,
      } as any,
    })
  );
  store.dispatch(
    addMessageToHeap({
      id: MESSAGE_ID,
      body: 'hello',
      date: new Date().toISOString(),
      roomJid: ROOM_JID,
      user: { id: 'me', name: 'Me Myself' },
    } as any)
  );
  store.dispatch(
    setMessageSendFailed({ roomJID: ROOM_JID, messageId: MESSAGE_ID })
  );
};

const roomMessages = () =>
  store.getState().rooms.rooms[ROOM_JID]?.messages || [];

const retryPayload = {
  originalMessageId: MESSAGE_ID,
  body: 'hello',
  roomJid: ROOM_JID,
};

describe('resendMessage - idempotent retry (preserveMessageId)', () => {
  beforeEach(() => {
    clearAllSendFailureWatchdogs();
    seed();
  });
  afterEach(() => {
    clearAllSendFailureWatchdogs();
    setGlobalXmppClient(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-sends under the ORIGINAL id and creates no second bubble', async () => {
    const client = makeClient();
    setGlobalXmppClient(client as any);

    const id = await resendMessage(retryPayload, { preserveMessageId: true });

    expect(id).toBe(MESSAGE_ID);
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage.mock.calls[0][SEND_MESSAGE_ID_ARG]).toBe(
      MESSAGE_ID
    );

    const mine = roomMessages().filter((m) => m.body === 'hello');
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(MESSAGE_ID);
    // Back to sending: no longer offering a retry, waiting on the echo again.
    expect(mine[0].failed).toBe(false);
    expect(mine[0].pending).toBe(true);
  });

  it('never retracts the original from the room', async () => {
    // React Native defect #31 delivered the message twice. Broadcasting a
    // delete and re-sending under a new id is the shape that produces that:
    // recipients who DID get the first copy see it vanish and reappear.
    const client = makeClient();
    setGlobalXmppClient(client as any);

    await resendMessage(retryPayload, { preserveMessageId: true });

    expect(client.deleteMessageStanza).not.toHaveBeenCalled();
  });

  it('double-tapping Retry sends exactly once', async () => {
    const client = makeClient(neverSettles);
    setGlobalXmppClient(client as any);

    // Two taps in the same tick, before anything could settle.
    const first = resendMessage(retryPayload, { preserveMessageId: true });
    const second = resendMessage(retryPayload, { preserveMessageId: true });
    await Promise.all([first, second]);

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(roomMessages().filter((m) => m.body === 'hello')).toHaveLength(1);
  });

  it('a second retry after the first one settled is allowed again', async () => {
    const client = makeClient();
    setGlobalXmppClient(client as any);

    await resendMessage(retryPayload, { preserveMessageId: true });
    // Let the settle handler release the single-writer slot.
    await Promise.resolve();
    await Promise.resolve();

    store.dispatch(
      setMessageSendFailed({ roomJID: ROOM_JID, messageId: MESSAGE_ID })
    );
    await resendMessage(retryPayload, { preserveMessageId: true });

    expect(client.sendMessage).toHaveBeenCalledTimes(2);
    expect(roomMessages().filter((m) => m.body === 'hello')).toHaveLength(1);
  });

  it('does not enqueue a second outbound copy when the first is still queued', async () => {
    const client = makeClient(neverSettles);
    setGlobalXmppClient(client as any);

    await resendMessage(retryPayload, { preserveMessageId: true });

    // The reconnect drain walks this heap. One entry per message, always.
    const heap = store.getState().roomHeapSlice.messageHeap;
    expect(heap.filter((m) => m.id === MESSAGE_ID)).toHaveLength(1);
  });

  it('re-arms the failure watchdog, so a retry that also goes unanswered fails again', async () => {
    vi.useFakeTimers();
    const client = makeClient(neverSettles);
    setGlobalXmppClient(client as any);

    await resendMessage(retryPayload, { preserveMessageId: true });
    expect(isMessageMarkedFailed(ROOM_JID, MESSAGE_ID)).toBe(false);

    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS + 1);
    expect(isMessageMarkedFailed(ROOM_JID, MESSAGE_ID)).toBe(true);
  });

  it('a late echo of the first attempt lands on the retried message, not beside it', async () => {
    const client = makeClient(neverSettles);
    setGlobalXmppClient(client as any);

    await resendMessage(retryPayload, { preserveMessageId: true });

    // The server had accepted attempt #1 all along and finally echoes it.
    store.dispatch(
      addRoomMessage({
        roomJID: ROOM_JID,
        message: {
          id: MESSAGE_ID,
          body: 'hello',
          date: new Date().toISOString(),
          roomJid: ROOM_JID,
          user: { id: 'me', name: 'Me Myself' },
          xmppId: 'archive-1',
        } as any,
      })
    );

    const mine = roomMessages().filter((m) => m.body === 'hello');
    expect(mine).toHaveLength(1);
    expect(mine[0].pending).toBe(false);
    expect(mine[0].failed).toBe(false);
  });

  it('still supports the legacy "resend as a new message" mode for hosts calling it directly', async () => {
    const client = makeClient();
    setGlobalXmppClient(client as any);

    const id = await resendMessage(retryPayload);

    expect(id).not.toBe(MESSAGE_ID);
    expect(client.deleteMessageStanza).toHaveBeenCalledWith(
      ROOM_JID,
      MESSAGE_ID
    );
    expect(client.sendMessage.mock.calls[0][SEND_MESSAGE_ID_ARG]).toBe(id);
  });
});
