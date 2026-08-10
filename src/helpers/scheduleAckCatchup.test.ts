import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { scheduleAckCatchup, ACK_CATCHUP_DELAY_MS } from './scheduleAckCatchup';
import { store } from '../roomStore';
import { addRoom, addRoomMessage } from '../roomStore/roomsSlice';

const ROOM_JID = 'ack-catchup-room@conference.example.com';

const makeClient = () => ({
  getHistoryStanza: vi.fn(() => Promise.resolve(undefined)),
  presenceInRoomStanza: vi.fn(() => Promise.resolve(true)),
});

const seedRoomWithPendingMessage = (messageId: string) => {
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
    addRoomMessage({
      roomJID: ROOM_JID,
      message: {
        id: messageId,
        body: 'hi',
        date: new Date().toISOString(),
        roomJid: ROOM_JID,
        user: { id: 'me', name: 'Me' },
        pending: true,
      } as any,
    })
  );
};

/** The MUC reflecting our own message back - what clears `pending`. */
const deliverEcho = (messageId: string) => {
  store.dispatch(
    addRoomMessage({
      roomJID: ROOM_JID,
      message: {
        id: messageId,
        body: 'hi',
        date: new Date().toISOString(),
        roomJid: ROOM_JID,
        user: { id: 'me', name: 'Me' },
      } as any,
    })
  );
};

// Regression: one send used to fire ~6 MAM queries (9 worst case) - an
// immediate fetch on every send, plus a retry loop re-arming every 700ms
// for 5s until the echo landed. Each query makes the server re-send the
// room's last 10-20 archived messages down the socket: the "I get my sent
// message back 4 times" seen in the WS frames.
describe('scheduleAckCatchup', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queries NO history on a healthy send - the MUC echo already did the job', async () => {
    const messageId = 'msg-healthy';
    seedRoomWithPendingMessage(messageId);
    const client = makeClient();

    scheduleAckCatchup(client as any, ROOM_JID, messageId);
    deliverEcho(messageId);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(client.getHistoryStanza).not.toHaveBeenCalled();
    expect(client.presenceInRoomStanza).not.toHaveBeenCalled();
  });

  it('queries history EXACTLY ONCE when the echo never arrives - never a storm', async () => {
    const messageId = 'msg-lost-echo';
    seedRoomWithPendingMessage(messageId);
    const client = makeClient();

    scheduleAckCatchup(client as any, ROOM_JID, messageId);

    // Far past the old 5s retry window, which fired ~8 times in here.
    await vi.advanceTimersByTimeAsync(30_000);

    expect(client.getHistoryStanza).toHaveBeenCalledTimes(1);
    expect(client.presenceInRoomStanza).toHaveBeenCalledTimes(1);
  });

  it('stays quiet during the grace period so a slow-but-healthy send is left alone', async () => {
    const messageId = 'msg-slow';
    seedRoomWithPendingMessage(messageId);
    const client = makeClient();

    scheduleAckCatchup(client as any, ROOM_JID, messageId);
    await vi.advanceTimersByTimeAsync(ACK_CATCHUP_DELAY_MS - 100);

    expect(client.getHistoryStanza).not.toHaveBeenCalled();
  });

  it('skips the history query if re-asserting presence is what unblocked the echo', async () => {
    const messageId = 'msg-presence-fixed';
    seedRoomWithPendingMessage(messageId);
    const client = makeClient();
    client.presenceInRoomStanza.mockImplementation(() => {
      deliverEcho(messageId);
      return Promise.resolve(true);
    });

    scheduleAckCatchup(client as any, ROOM_JID, messageId);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(client.presenceInRoomStanza).toHaveBeenCalledTimes(1);
    expect(client.getHistoryStanza).not.toHaveBeenCalled();
  });

  it('can be cancelled, so an unmount leaves no probe armed', async () => {
    const messageId = 'msg-cancelled';
    seedRoomWithPendingMessage(messageId);
    const client = makeClient();

    clearTimeout(scheduleAckCatchup(client as any, ROOM_JID, messageId));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(client.getHistoryStanza).not.toHaveBeenCalled();
  });
});
