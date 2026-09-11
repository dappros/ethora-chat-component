import { afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '../roomStore';
import { addRoom, setLogoutState, setRoomMuted } from '../roomStore/roomsSlice';
import { messageNotificationManager } from './messageNotificationManager';
import { IMessage } from '../types/models/message.model';

const ROOM_MUTED = 'muted-room@conference.example.com';
const ROOM_OPEN = 'open-room@conference.example.com';

const seedRoom = (jid: string, muted: boolean) => {
  store.dispatch(
    addRoom({
      roomData: {
        jid,
        name: jid,
        title: jid,
        usersCnt: 1,
        messages: [],
        isLoading: false,
        roomBg: null,
      } as never,
    })
  );
  if (muted) {
    store.dispatch(setRoomMuted({ jid, muted: true }));
  }
};

const makeMessage = (id: string): IMessage =>
  ({ id, body: 'hello there', user: { id: 'sender', name: 'Sender' } }) as IMessage;

// showNotification() is the single choke point every alert surface (in-app
// toast, browser Notification API, foreground push toast) funnels through -
// see the comment in messageNotificationManager.ts. Gating it here covers
// all of them for both call sites (live XMPP messages in stanzaHandlers.ts,
// foreground FCM push in usePushNotifications.ts) without duplicating the
// check in each.
describe('messageNotificationManager - per-chat mute suppresses the alert', () => {
  afterEach(() => {
    store.dispatch(setLogoutState());
  });

  it('does not invoke registered callbacks for a muted room', () => {
    seedRoom(ROOM_MUTED, true);
    const callback = vi.fn();
    const unsubscribe = messageNotificationManager.addCallback(callback);

    messageNotificationManager.showNotification(
      makeMessage('muted-msg-1'),
      'Room',
      'Sender',
      ROOM_MUTED
    );

    expect(callback).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('still invokes registered callbacks for an unmuted room', () => {
    seedRoom(ROOM_OPEN, false);
    const callback = vi.fn();
    const unsubscribe = messageNotificationManager.addCallback(callback);

    messageNotificationManager.showNotification(
      makeMessage('open-msg-1'),
      'Room',
      'Sender',
      ROOM_OPEN
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'open-msg-1' }),
      'Room',
      'Sender',
      ROOM_OPEN
    );
    unsubscribe();
  });

  it('does not treat a room the store has never seen as muted', () => {
    const callback = vi.fn();
    const unsubscribe = messageNotificationManager.addCallback(callback);

    messageNotificationManager.showNotification(
      makeMessage('unknown-room-msg-1'),
      'Room',
      'Sender',
      'unknown-room@conference.example.com'
    );

    expect(callback).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
