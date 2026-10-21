import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestOutgoingCall, sendCallInviteSignal } = vi.hoisted(() => ({
  requestOutgoingCall: vi.fn(async () => {}),
  sendCallInviteSignal: vi.fn(),
}));
vi.mock('./startCall', () => ({ requestOutgoingCall }));
vi.mock('../networking/callTokenStanza', () => ({ sendCallInviteSignal }));

import { placeRoomCall } from './placeCall';

const members = [
  { xmppUsername: 'me_1@xmpp.example.com', firstName: 'Me', lastName: 'M' },
  { xmppUsername: 'pat_1@xmpp.example.com', firstName: 'Pat', lastName: 'P' },
] as any;

describe('placeRoomCall', () => {
  beforeEach(() => {
    requestOutgoingCall.mockReset();
    requestOutgoingCall.mockResolvedValue(undefined);
    sendCallInviteSignal.mockReset();
  });

  it('dials a 1:1 room: bare chat name, the peer, the invite signal', async () => {
    const dispatch = vi.fn();
    await placeRoomCall({
      dispatch,
      room: { jid: 'app_room@conference.example.com', name: 'Pat P', type: 'private', members },
      kind: 'video',
      selfXmppUsername: 'me_1',
    });
    const start = dispatch.mock.calls[0][0];
    expect(start.type).toBe('call/startOutgoingCall');
    expect(start.payload).toMatchObject({
      roomJid: 'app_room@conference.example.com',
      roomBareName: 'app_room',
      kind: 'video',
      peerXmppUsername: 'pat_1@xmpp.example.com',
      isGroup: false,
    });
    expect(sendCallInviteSignal).toHaveBeenCalledWith('video', {
      peerXmppUsername: 'pat_1@xmpp.example.com',
      roomBareName: 'app_room',
    });
    expect(requestOutgoingCall).toHaveBeenCalledWith({
      chatName: 'app_room',
      kind: 'video',
      peerXmppUsername: 'pat_1@xmpp.example.com',
    });
  });

  it('dials a group room with no single peer and no direct signal', async () => {
    const dispatch = vi.fn();
    await placeRoomCall({
      dispatch,
      room: { jid: 'app_team@conference.example.com', name: 'Team', type: 'group', members },
      kind: 'audio',
      selfXmppUsername: 'me_1',
    });
    expect(dispatch.mock.calls[0][0].payload).toMatchObject({ isGroup: true, peerXmppUsername: null, kind: 'audio' });
    expect(sendCallInviteSignal).not.toHaveBeenCalled();
    expect(requestOutgoingCall).toHaveBeenCalledWith({
      chatName: 'app_team',
      kind: 'audio',
      peerXmppUsername: null,
    });
  });

  it('names the dial screen after the peer when the room name is a server sentinel', async () => {
    const dispatch = vi.fn();
    await placeRoomCall({
      dispatch,
      room: { jid: 'app_room@conference.example.com', name: 'Deleted User', type: 'private', members },
      kind: 'video',
      selfXmppUsername: 'me_1',
    });
    expect(dispatch.mock.calls[0][0].payload.roomName).toBe('Pat P');
  });

  it('reports a failed request through the call slice instead of throwing', async () => {
    requestOutgoingCall.mockRejectedValue(new Error('Error creating chat call'));
    const dispatch = vi.fn();
    await expect(
      placeRoomCall({
        dispatch,
        room: { jid: 'app_team@conference.example.com', name: 'Team', type: 'group', members },
        kind: 'video',
      })
    ).resolves.toBeUndefined();
    const last = dispatch.mock.calls[dispatch.mock.calls.length - 1][0];
    expect(last.type).toBe('call/setCallError');
    expect(last.payload).toBe('Error creating chat call');
  });

  it('does nothing without a room jid', async () => {
    const dispatch = vi.fn();
    await placeRoomCall({ dispatch, room: { jid: '', name: '' } as any, kind: 'video' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
