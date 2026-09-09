import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import XmppClient from './xmppClient';
import { store } from '../roomStore';
import {
  addRoom,
  addRoomMessage,
  setMessageSendFailed,
} from '../roomStore/roomsSlice';
import { addMessageToHeap, clearHeap } from '../roomStore/roomHeapSlice';
import {
  beginSendRetry,
  clearAllSendFailureWatchdogs,
  endSendRetry,
} from '../helpers/sendFailureWatchdog';

const ROOM_JID = 'drain-room@conference.example.com';

/**
 * drainHeap runs on every reconnect and re-sends everything the outbound
 * heap still holds. Building the instance without the constructor keeps
 * this a unit test - the real constructor opens a websocket.
 */
const makeDrainableClient = () => {
  const instance: any = Object.create(XmppClient.prototype);
  instance.pendingSendById = new Map();
  instance.inFlightIds = new Set();
  instance.sendMessage = vi.fn(async () => true);
  instance.sendTextMessageWithTranslateTagStanza = vi.fn(async () => true);
  return instance;
};

const drain = (instance: any): Promise<void> =>
  (XmppClient.prototype as any).drainHeap.call(instance);

const seedRoom = () => {
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
};

const seedUnsent = (id: string, body = 'queued text') => {
  store.dispatch(
    addRoomMessage({
      roomJID: ROOM_JID,
      message: {
        id,
        body,
        date: new Date().toISOString(),
        roomJid: ROOM_JID,
        user: { id: 'me', name: 'Me', firstName: 'Me', lastName: 'Myself' },
        pending: true,
      } as any,
    })
  );
  store.dispatch(
    addMessageToHeap({
      id,
      body,
      date: new Date().toISOString(),
      roomJid: ROOM_JID,
      user: { id: 'me', name: 'Me', firstName: 'Me', lastName: 'Myself' },
    } as any)
  );
};

const sentIds = (instance: any) =>
  instance.sendMessage.mock.calls.map((call: any[]) => call.at(-1));

const heapIds = () =>
  store.getState().roomHeapSlice.messageHeap.map((m) => m.id);

describe('drainHeap - the reconnect auto-resend', () => {
  beforeEach(() => {
    clearAllSendFailureWatchdogs();
    seedRoom();
  });
  afterEach(() => {
    clearAllSendFailureWatchdogs();
    store.dispatch(clearHeap());
    vi.restoreAllMocks();
  });

  it('re-sends a genuinely unsent message under its original id', async () => {
    const client = makeDrainableClient();
    seedUnsent('drain-1');

    await drain(client);

    expect(sentIds(client)).toEqual(['drain-1']);
    expect(heapIds()).not.toContain('drain-1');
  });

  it('skips a message the user has already been told failed', async () => {
    // The contract behind the Retry button: once someone has been shown
    // "not delivered", the message is theirs to resend. Sending it behind
    // their back means a reconnect plus a tap delivers it twice - exactly
    // the duplicate half of React Native defect #31.
    const client = makeDrainableClient();
    seedUnsent('drain-failed');
    store.dispatch(
      setMessageSendFailed({ roomJID: ROOM_JID, messageId: 'drain-failed' })
    );

    await drain(client);

    expect(client.sendMessage).not.toHaveBeenCalled();
    // ... and it is still queued, so nothing is lost if they do tap Retry.
    expect(heapIds()).toContain('drain-failed');
  });

  it('skips a message a manual retry currently owns', async () => {
    const client = makeDrainableClient();
    seedUnsent('drain-retrying');
    beginSendRetry('drain-retrying');

    await drain(client);

    expect(client.sendMessage).not.toHaveBeenCalled();
    endSendRetry('drain-retrying');
  });

  it('skips a message the send queue is already holding', async () => {
    // processQueue runs immediately before this drain on the same 'online'
    // event and re-issues entries that survived the disconnect. Without
    // this check both paths put the same message on the wire.
    const client = makeDrainableClient();
    seedUnsent('drain-queued');
    client.pendingSendById.set('drain-queued', {
      state: 'queued',
      roomJid: ROOM_JID,
    });

    await drain(client);

    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('skips a message whose echo already landed', async () => {
    const client = makeDrainableClient();
    seedUnsent('drain-echoed');
    store.dispatch(
      addRoomMessage({
        roomJID: ROOM_JID,
        message: {
          id: 'drain-echoed',
          body: 'queued text',
          date: new Date().toISOString(),
          roomJid: ROOM_JID,
          user: { id: 'me', name: 'Me' },
          xmppId: 'archive-echoed',
        } as any,
      })
    );

    await drain(client);

    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the messages it skipped queued instead of wiping the whole heap', async () => {
    // The old blanket clearHeap() at the end of the drain threw away every
    // entry, including the ones this loop deliberately left alone.
    const client = makeDrainableClient();
    seedUnsent('drain-ok');
    seedUnsent('drain-mine');
    store.dispatch(
      setMessageSendFailed({ roomJID: ROOM_JID, messageId: 'drain-mine' })
    );

    await drain(client);

    expect(sentIds(client)).toEqual(['drain-ok']);
    expect(heapIds()).toEqual(['drain-mine']);
  });

  it('leaves the rest of the queue intact when a send fails part-way through', async () => {
    const client = makeDrainableClient();
    seedUnsent('drain-a');
    seedUnsent('drain-b');
    client.sendMessage = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await drain(client);

    expect(heapIds()).toEqual(['drain-b']);
  });
});
