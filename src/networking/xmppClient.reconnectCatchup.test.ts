import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import XmppClient from './xmppClient';
import { store } from '../roomStore';
import { addRoom, setCurrentRoom } from '../roomStore/roomsSlice';

// A phone that loses the network usually keeps a half-open WebSocket: the
// client still reads 'online' when the network returns, while the server has
// dropped the session. Messages sent to us meanwhile never arrived. These
// cover the two halves of the fix: probing the socket at once, and pulling the
// newest history after the reconnect. Instances are built without the
// constructor, which would open a real socket.

const ROOM_A = 'catchup-a@conference.example.com';
const ROOM_B = 'catchup-b@conference.example.com';

const room = (jid: string) =>
  ({ jid, name: jid, title: jid, usersCnt: 0, messages: [], isLoading: false, roomBg: null }) as any;

const fakeSocket = () => {
  const listeners = new Set<(s: any) => void>();
  return {
    send: vi.fn(async () => undefined),
    on: vi.fn((event: string, cb: (s: any) => void) => {
      if (event === 'stanza') listeners.add(cb);
    }),
    removeListener: vi.fn((_event: string, cb: (s: any) => void) => listeners.delete(cb)),
    emit: (stanza: any) => listeners.forEach((cb) => cb(stanza)),
    listeners,
    status: 'online',
  };
};

const makeClient = (socket = fakeSocket()) => {
  const instance: any = Object.create(XmppClient.prototype);
  instance.client = socket;
  instance.host = 'example.com';
  instance.status = 'online';
  instance.pongTimeoutMs = 1000;
  instance.pingInFlight = false;
  instance.intentionalLogout = false;
  instance.lastActivityTs = 0;
  instance.activeRoomJid = null;
  instance.staleRoomsAfterReconnect = new Set<string>();
  instance.connectionSteps = [];
  instance.scheduleReconnect = vi.fn();
  instance.markActivity = vi.fn();
  instance.getHistoryStanza = vi.fn(async () => []);
  return { instance, socket };
};

describe('reconnect catch-up', () => {
  beforeEach(() => {
    store.dispatch(addRoom({ roomData: room(ROOM_A) }));
    store.dispatch(addRoom({ roomData: room(ROOM_B) }));
    store.dispatch(setCurrentRoom({ roomJID: ROOM_A }));
  });

  it('marks every loaded room stale and fetches the open room newest page at once', () => {
    const { instance } = makeClient();
    (XmppClient.prototype as any).catchUpAfterReconnect.call(instance);
    expect(instance.staleRoomsAfterReconnect.has(ROOM_A)).toBe(true);
    expect(instance.staleRoomsAfterReconnect.has(ROOM_B)).toBe(true);
    expect(instance.getHistoryStanza).toHaveBeenCalledWith(ROOM_A, 30, undefined, undefined, {
      source: 'active',
    });
  });
});

describe('probeConnection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const probe = (instance: any, reason = 'browser:online') =>
    (XmppClient.prototype as any).probeConnection.call(instance, reason);

  it('reconnects a socket that reads online but never answers the ping', () => {
    const { instance, socket } = makeClient();
    probe(instance);
    expect(socket.send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4100);
    expect(instance.scheduleReconnect).toHaveBeenCalledWith('browser:online:no-pong');
    expect(socket.listeners.size).toBe(0);
    expect(instance.pingInFlight).toBe(false);
  });

  it('keeps a socket that answers the ping', () => {
    const { instance, socket } = makeClient();
    probe(instance);
    const sent = (socket.send.mock.calls[0] as any[])[0];
    const id = sent.attrs.id;
    socket.emit({ name: 'iq', attrs: { type: 'result', id }, getChild: () => null, is: (n: string) => n === 'iq' });
    vi.advanceTimersByTime(5000);
    expect(instance.scheduleReconnect).not.toHaveBeenCalled();
    expect(instance.markActivity).toHaveBeenCalled();
  });

  it('reconnects straight away when the client already knows it is offline', () => {
    const { instance, socket } = makeClient();
    instance.status = 'offline';
    probe(instance);
    expect(socket.send).not.toHaveBeenCalled();
    expect(instance.scheduleReconnect).toHaveBeenCalledWith('browser:online');
  });

  it('does nothing after an intentional logout', () => {
    const { instance, socket } = makeClient();
    instance.intentionalLogout = true;
    probe(instance);
    expect(socket.send).not.toHaveBeenCalled();
    expect(instance.scheduleReconnect).not.toHaveBeenCalled();
  });
});
