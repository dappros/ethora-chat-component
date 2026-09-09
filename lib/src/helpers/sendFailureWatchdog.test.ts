import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  armSendFailureWatchdog,
  clearAllSendFailureWatchdogs,
  clearSendFailureWatchdog,
  SEND_FAILURE_TIMEOUT_MS,
  SEND_FAILURE_MIN_TIMEOUT_MS,
  isMessageMarkedFailed,
} from './sendFailureWatchdog';
import { ACK_CATCHUP_DELAY_MS } from './scheduleAckCatchup';
import { store } from '../roomStore';
import { addRoom, addRoomMessage } from '../roomStore/roomsSlice';
import { setConfig } from '../roomStore/chatSettingsSlice';

const ROOM_JID = 'failure-watchdog-room@conference.example.com';

const seedRoom = () => {
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
};

/** The optimistic bubble the sender sees the instant they hit send. */
const seedPendingMessage = (messageId: string, body = 'hi') => {
  store.dispatch(
    addRoomMessage({
      roomJID: ROOM_JID,
      message: {
        id: messageId,
        body,
        date: new Date().toISOString(),
        roomJid: ROOM_JID,
        user: { id: 'me', name: 'Me' },
        pending: true,
      } as any,
    })
  );
};

/** The MUC reflecting our own message back - the only acknowledgement we get. */
const deliverEcho = (messageId: string, body = 'hi') => {
  store.dispatch(
    addRoomMessage({
      roomJID: ROOM_JID,
      message: {
        id: messageId,
        body,
        date: new Date().toISOString(),
        roomJid: ROOM_JID,
        user: { id: 'me', name: 'Me' },
        xmppId: `archive-${messageId}`,
      } as any,
    })
  );
};

const roomMessages = () =>
  store.getState().rooms.rooms[ROOM_JID]?.messages || [];

const findById = (messageId: string) =>
  roomMessages().filter((m) => m.id === messageId);

describe('sendFailureWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearAllSendFailureWatchdogs();
    seedRoom();
    store.dispatch(setConfig({ eventHandlers: {} } as any));
  });
  afterEach(() => {
    clearAllSendFailureWatchdogs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('never fires before the ack catch-up probe has had its chance to repair the send', () => {
    // The probe re-asserts presence and pulls MAM at ACK_CATCHUP_DELAY_MS.
    // A watchdog allowed to fire first would call a recoverable send failed.
    expect(SEND_FAILURE_MIN_TIMEOUT_MS).toBeGreaterThan(ACK_CATCHUP_DELAY_MS);
    expect(SEND_FAILURE_TIMEOUT_MS).toBeGreaterThanOrEqual(
      SEND_FAILURE_MIN_TIMEOUT_MS
    );

    const id = 'msg-floor';
    seedPendingMessage(id);
    armSendFailureWatchdog({
      roomJID: ROOM_JID,
      messageId: id,
      body: 'hi',
      // Even asked for something trigger-happy, the floor wins.
      timeoutMs: 10,
    });

    vi.advanceTimersByTime(ACK_CATCHUP_DELAY_MS);
    expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(false);
  });

  it('marks a send failed once the echo has not arrived within the timeout', () => {
    const id = 'msg-never-echoed';
    seedPendingMessage(id);
    armSendFailureWatchdog({ roomJID: ROOM_JID, messageId: id, body: 'hi' });

    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS - 1);
    expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(false);

    vi.advanceTimersByTime(2);
    expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(true);
    // Still pending, still the same id: the message keeps its identity so a
    // late echo can land on it.
    expect(findById(id)).toHaveLength(1);
    expect(findById(id)[0].pending).toBe(true);
  });

  it('fires config.eventHandlers.onMessageFailed so hosts hear about it', () => {
    const onMessageFailed = vi.fn();
    store.dispatch(setConfig({ eventHandlers: { onMessageFailed } } as any));

    const id = 'msg-host-notified';
    seedPendingMessage(id, 'important');
    armSendFailureWatchdog({
      roomJID: ROOM_JID,
      messageId: id,
      body: 'important',
    });
    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS + 1);

    expect(onMessageFailed).toHaveBeenCalledTimes(1);
    expect(onMessageFailed.mock.calls[0][0]).toMatchObject({
      message: 'important',
      roomJID: ROOM_JID,
      messageType: 'text',
    });
  });

  // React Native defect #31: a message the server had accepted was shown as
  // failed and then delivered a second time. The half this test pins down is
  // "the server's word wins" - the echo can arrive at any point, including
  // long after we gave up waiting, and when it does the sender must end up
  // with exactly ONE message, acknowledged.
  it('a late echo after the timeout reconciles onto the same message, leaving no duplicate', () => {
    const onMessageFailed = vi.fn();
    store.dispatch(setConfig({ eventHandlers: { onMessageFailed } } as any));

    const id = 'msg-late-echo';
    seedPendingMessage(id, 'late one');
    armSendFailureWatchdog({
      roomJID: ROOM_JID,
      messageId: id,
      body: 'late one',
    });

    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS + 1);
    expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(true);

    // ... and 30 seconds later the MUC finally reflects it back.
    deliverEcho(id, 'late one');

    const matches = findById(id);
    expect(matches).toHaveLength(1);
    expect(matches[0].failed).toBe(false);
    expect(matches[0].pending).toBe(false);
    // No second bubble anywhere in the room either.
    expect(roomMessages().filter((m) => m.body === 'late one')).toHaveLength(1);
  });

  it('does nothing when the echo landed before the timeout', () => {
    const onMessageFailed = vi.fn();
    store.dispatch(setConfig({ eventHandlers: { onMessageFailed } } as any));

    const id = 'msg-healthy';
    seedPendingMessage(id);
    armSendFailureWatchdog({ roomJID: ROOM_JID, messageId: id, body: 'hi' });
    deliverEcho(id);

    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS * 3);

    expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(false);
    expect(onMessageFailed).not.toHaveBeenCalled();
  });

  // The other half of defect #31's trigger-happiness: a burst serialises
  // through the send queue, so the later messages in it echo noticeably
  // later than the first. None of them may be called failed just for being
  // behind the others.
  it('a rapid burst whose echoes trickle in late marks nothing as failed', () => {
    const onMessageFailed = vi.fn();
    store.dispatch(setConfig({ eventHandlers: { onMessageFailed } } as any));

    const ids = Array.from({ length: 12 }, (_, i) => `burst-${i}`);
    ids.forEach((id) => {
      seedPendingMessage(id, id);
      armSendFailureWatchdog({ roomJID: ROOM_JID, messageId: id, body: id });
    });

    // Echoes arrive spread across most of the window - slow, but healthy.
    ids.forEach((id, i) => {
      vi.advanceTimersByTime(Math.floor(SEND_FAILURE_TIMEOUT_MS / 24));
      deliverEcho(id, id);
      void i;
    });

    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS * 2);

    expect(onMessageFailed).not.toHaveBeenCalled();
    ids.forEach((id) => {
      expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(false);
      expect(findById(id)).toHaveLength(1);
      expect(findById(id)[0].pending).toBe(false);
    });
  });

  it('re-arming replaces the previous timer instead of racing it', () => {
    const onMessageFailed = vi.fn();
    store.dispatch(setConfig({ eventHandlers: { onMessageFailed } } as any));

    const id = 'msg-rearmed';
    seedPendingMessage(id);
    armSendFailureWatchdog({ roomJID: ROOM_JID, messageId: id, body: 'hi' });
    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS - 500);

    // A retry re-arms: the clock restarts, the old timer must not fire.
    armSendFailureWatchdog({ roomJID: ROOM_JID, messageId: id, body: 'hi' });
    vi.advanceTimersByTime(600);
    expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(false);

    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS);
    expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(true);
    expect(onMessageFailed).toHaveBeenCalledTimes(1);
  });

  it('can be disarmed, so an acknowledged send leaves no timer behind', () => {
    const id = 'msg-disarmed';
    seedPendingMessage(id);
    armSendFailureWatchdog({ roomJID: ROOM_JID, messageId: id, body: 'hi' });
    clearSendFailureWatchdog(id);

    vi.advanceTimersByTime(SEND_FAILURE_TIMEOUT_MS * 2);
    expect(isMessageMarkedFailed(ROOM_JID, id)).toBe(false);
  });
});
