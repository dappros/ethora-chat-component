import { useCallback, useEffect, useState } from 'react';
import { store } from '../../roomStore';
import { addRoom, setCurrentRoom } from '../../roomStore/roomsSlice';

/**
 * A throwaway visitor + room, so the demo runs with no credentials.
 *
 * `POST /v2/widget/sessions` is the same endpoint the embeddable assistant
 * uses to put an anonymous website visitor into a real MUC room: the server
 * mints a visitor JID with a password and a room to talk in. Borrowing it
 * here keeps this page open-and-run instead of "first go find a login" -
 * and it is the only part of the demo that is demo-specific. A host
 * embedding the chat normally already has a signed-in user.
 */

export interface DemoSession {
  appId: string;
  baseUrl: string;
  roomJID: string;
  user: {
    _id: string;
    appId: string;
    username: string;
    name: string;
    walletAddress: string;
    firstName: string;
    lastName: string;
    xmppUsername: string;
    xmppPassword: string;
    token: string;
    refreshToken: string;
    defaultWallet: { walletAddress: string };
  };
  xmppSettings: {
    devServer: string;
    host: string;
    conference: string;
  };
}

const DEMO_APP_ID = '646cc8dc96d4a4dc8f7b2f2d';
const DEMO_API_BASE = 'https://api.chat.ethora.com';

/** Host part of a JID, used when the envelope omits the `xmpp` block. */
const hostOf = (jid?: string): string =>
  jid && jid.includes('@') ? jid.split('@')[1] || '' : '';

export function useDemoSession() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${DEMO_API_BASE}/v2/widget/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appId: DEMO_APP_ID }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const envelope = await response.json();

      const roomJID: string = envelope?.room?.jid || '';
      const host: string =
        envelope?.xmpp?.host || hostOf(envelope?.visitor?.jid);
      const conference: string =
        envelope?.xmpp?.service || hostOf(roomJID) || `conference.${host}`;
      const devServer: string = envelope?.xmpp?.wsUrl || `wss://${host}/ws`;

      if (!roomJID || !host) {
        throw new Error('session envelope is missing a room or an xmpp host');
      }

      setSession({
        appId: DEMO_APP_ID,
        baseUrl: DEMO_API_BASE,
        roomJID,
        user: {
          _id: envelope.visitor.uuid || envelope.visitor.xmppUsername,
          appId: DEMO_APP_ID,
          username: envelope.visitor.xmppUsername,
          name: envelope.visitor.xmppUsername,
          walletAddress: '',
          firstName: 'Demo',
          lastName: 'Visitor',
          xmppUsername: envelope.visitor.xmppUsername,
          xmppPassword: envelope.visitor.xmppPassword,
          token: '',
          refreshToken: '',
          defaultWallet: { walletAddress: '' },
        },
        xmppSettings: { devServer, host, conference },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  // The provisioned MUC room is not in this visitor's `GET /chats/my` (they
  // have no API token) and the room-list IQ does not surface it either, so
  // <Chat> would sit on "No room" forever even though the JID is right here.
  // Register it directly, and keep re-asserting it: persist rehydration and
  // reconnects both reset the rooms map. The guards make each pass a no-op
  // once it is in place, so this converges instead of looping.
  useEffect(() => {
    if (!session?.roomJID) return;
    const roomJID = session.roomJID;
    const room: any = {
      jid: roomJID,
      name: 'Quiz demo',
      title: 'Quiz demo',
      usersCnt: 0,
      members: [],
      messages: [],
      isLoading: false,
      unreadMessages: 0,
      historyPreloadState: 'idle',
    };

    const ensure = () => {
      const state: any = store.getState();
      if (!state?.rooms) return;
      if (!state.rooms.rooms?.[roomJID]) {
        store.dispatch(addRoom({ roomData: room }));
      }
      if (state.rooms.activeRoomJID !== roomJID) {
        store.dispatch(setCurrentRoom({ roomJID }));
      }
    };

    ensure();
    return store.subscribe(ensure);
  }, [session?.roomJID]);

  return { session, connect, loading, error };
}
