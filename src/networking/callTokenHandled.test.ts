import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import { onCallTokenMessage } from './callTokenStanza';
import { store } from '../roomStore';
import { resetCall } from '../roomStore/callSlice';
import { setConfig, setUser } from '../roomStore/chatSettingsSlice';
import { markCallHandled, resetHandledCalls } from '../utils/handledCalls';

const ROOM_JID = 'app_alice-app_bob@conference.xmpp.example.com';

// The server's call-token broadcast, as it can arrive again after a reconnect.
const callToken = (callId: string) =>
  parse(
    `<message xmlns='jabber:client' type='chat' from='system@xmpp.example.com' to='app_bob@xmpp.example.com'>` +
      `<stanza-id xmlns='urn:xmpp:sid:0' id='${Date.now()}000' by='x'/>` +
      `<data type='call-token' token='jwt' room='${ROOM_JID}' callId='${callId}' kind='audio'/>` +
      `</message>`
  );

describe('call-token for a call another tab already handled', () => {
  beforeEach(() => {
    store.dispatch(resetCall());
    resetHandledCalls();
    store.dispatch(setConfig({ videoCalls: { enabled: true } } as any));
    store.dispatch(setUser({ xmppUsername: 'app_bob@xmpp.example.com' } as any));
  });

  it('rings for a fresh call', () => {
    expect(onCallTokenMessage(callToken('call-1'))).toBe(true);
    expect(store.getState().call).toMatchObject({ phase: 'ringing-incoming', callId: 'call-1' });
  });

  it('does not ring again for a replay of a handled call, but swallows the stanza', () => {
    markCallHandled('call-1');
    expect(onCallTokenMessage(callToken('call-1'))).toBe(true);
    expect(store.getState().call.phase).toBe('idle');
  });

  it('still rings for a different call', () => {
    markCallHandled('call-1');
    onCallTokenMessage(callToken('call-2'));
    expect(store.getState().call).toMatchObject({ phase: 'ringing-incoming', callId: 'call-2' });
  });
});
