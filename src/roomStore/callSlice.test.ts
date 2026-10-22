import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import callReducer, {
  acceptIncomingCall,
  declineIncomingCall,
  setCallError,
  setCallPhase,
  setIncomingCallToken,
  setOutgoingCallToken,
  startOutgoingCall,
} from './callSlice';

const ROOM_A = 'app_a-app_b@conference.test';
const ROOM_C = 'app_c-app_b@conference.test';

const ring = (callId: string | null, roomJid = ROOM_A, token = 'jwt') =>
  setIncomingCallToken({ roomJid, token, kind: 'audio', callId, peerXmppUsername: 'app_a' });

const makeStore = () => configureStore({ reducer: { call: callReducer } });

describe('callSlice incoming-token guard', () => {
  it('rings when idle', () => {
    const store = makeStore();
    store.dispatch(ring('c-1'));
    expect(store.getState().call).toMatchObject({ phase: 'ringing-incoming', callId: 'c-1', token: 'jwt' });
  });

  it('a late token for the call just accepted does not drop it back to ringing', () => {
    const store = makeStore();
    store.dispatch(ring('c-1'));
    store.dispatch(acceptIncomingCall());
    const connecting = store.getState().call;
    store.dispatch(ring('c-1', ROOM_A, 'late-jwt'));
    expect(store.getState().call).toEqual(connecting);
    expect(store.getState().call.phase).toBe('connecting');
    expect(store.getState().call.token).toBe('jwt');
  });

  it('a late token during an in-call session leaves it alone', () => {
    const store = makeStore();
    store.dispatch(ring('c-1'));
    store.dispatch(acceptIncomingCall());
    store.dispatch(setCallPhase('in-call'));
    const live = store.getState().call;
    store.dispatch(ring('c-1', ROOM_A, 'late-jwt'));
    expect(store.getState().call).toEqual(live);
    expect(store.getState().call.phase).toBe('in-call');
  });

  it('ignores a different call while one is connecting or in-call (busy)', () => {
    const store = makeStore();
    store.dispatch(ring('c-1'));
    store.dispatch(acceptIncomingCall());
    store.dispatch(ring('c-2', ROOM_C));
    expect(store.getState().call).toMatchObject({ phase: 'connecting', callId: 'c-1', roomJid: ROOM_A });
    store.dispatch(setCallPhase('in-call'));
    store.dispatch(ring('c-2', ROOM_C));
    expect(store.getState().call).toMatchObject({ phase: 'in-call', callId: 'c-1' });
  });

  it('ignores an incoming call while dialling out', () => {
    const store = makeStore();
    store.dispatch(startOutgoingCall({ roomJid: ROOM_A, kind: 'video', peerXmppUsername: 'app_a' }));
    const dialling = store.getState().call;
    store.dispatch(ring('c-2', ROOM_C));
    expect(store.getState().call).toEqual(dialling);
    store.dispatch(setOutgoingCallToken({ roomJid: ROOM_A, token: 'out', callId: 'c-9' }));
    store.dispatch(ring('c-2', ROOM_C));
    expect(store.getState().call).toMatchObject({ phase: 'connecting', direction: 'outgoing', callId: 'c-9' });
  });

  it('the same call ringing again changes nothing: no restart, no startedAt extension', () => {
    const store = makeStore();
    store.dispatch(ring('c-1'));
    const first = store.getState().call;
    const realNow = Date.now;
    Date.now = () => realNow() + 20_000;
    try {
      store.dispatch(ring('c-1', ROOM_A, 'other-jwt'));
    } finally {
      Date.now = realNow;
    }
    expect(store.getState().call).toEqual(first);
  });

  it('with no callId on either side, the same room is the same ring', () => {
    const store = makeStore();
    store.dispatch(ring(null));
    const first = store.getState().call;
    store.dispatch(ring(null, ROOM_A, 'x'));
    expect(store.getState().call).toEqual(first);
    store.dispatch(ring(null, ROOM_C, 'x'));
    expect(store.getState().call.roomJid).toBe(ROOM_C);
  });

  it('a newer call replaces a ring whose cancel was never seen', () => {
    const store = makeStore();
    store.dispatch(ring('c-1'));
    store.dispatch(ring('c-2', ROOM_C, 'newer'));
    expect(store.getState().call).toMatchObject({ phase: 'ringing-incoming', callId: 'c-2', roomJid: ROOM_C, token: 'newer' });
  });

  it('rings again after the call ended or an error card was dismissed', () => {
    const store = makeStore();
    store.dispatch(ring('c-1'));
    store.dispatch(declineIncomingCall());
    store.dispatch(ring('c-1'));
    expect(store.getState().call.phase).toBe('ringing-incoming');
    store.dispatch(setCallError('boom'));
    store.dispatch(ring('c-3', ROOM_C));
    expect(store.getState().call).toMatchObject({ phase: 'ringing-incoming', callId: 'c-3' });
  });

  it('accepting twice does not push an in-call session back to connecting', () => {
    const store = makeStore();
    store.dispatch(ring('c-1'));
    store.dispatch(acceptIncomingCall());
    store.dispatch(setCallPhase('in-call'));
    store.dispatch(acceptIncomingCall());
    expect(store.getState().call.phase).toBe('in-call');
  });
});
