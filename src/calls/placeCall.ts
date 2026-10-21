import type { Dispatch } from '@reduxjs/toolkit';
import type { IRoom } from '../types/types';
import { requestOutgoingCall } from './startCall';
import type { CallKindName } from './callMode';
import { setCallError, startOutgoingCall } from '../roomStore/callSlice';
import { sendCallInviteSignal } from '../networking/callTokenStanza';

/**
 * Dials a call in `room`: the one path every "start or join a call" entry
 * point shares (the chat header buttons and the scheduled-call Join button).
 * Which transport carries it is the server's decision (p2p for 1:1, LiveKit
 * for groups); a group call that is already running is joined, not duplicated.
 *
 * `chatName` is the bare room name (the JID local part), never the display
 * title. Failures surface through the call slice's error state.
 */
export async function placeRoomCall(params: {
  dispatch: Dispatch;
  room: Pick<IRoom, 'jid' | 'name' | 'members'> & { type?: IRoom['type'] };
  kind: CallKindName;
  selfXmppUsername?: string | null;
}): Promise<void> {
  const { dispatch, room, kind } = params;
  if (!room?.jid) return;

  // The call API expects the bare room name (e.g. "${appId}_<uuid>"),
  // which createRoomFromApi stores as the JID localpart. `room.name`
  // looks tempting but actually holds the display title (e.g. the other
  // party's "First Last"), so passing it produces nonsense URLs like
  // /v1/chats/call/create/test2%20test2.
  const chatName = room.jid.split('@')[0];
  if (!chatName) return;

  const isGroupRoom = room.type === 'group';

  // Resolve the peer xmpp localpart so we can XMPP-signal them when
  // we hang up / cancel - without this they'd keep ringing forever.
  // A group call has no single peer to signal; the server rings every
  // member and LiveKit carries the call.
  const selfLocal = String(params.selfXmppUsername || '').split('@')[0];
  const peer = isGroupRoom
    ? undefined
    : (room.members || []).find((member) => {
        const mLocal = String(member?.xmppUsername || '').split('@')[0];
        return mLocal && mLocal !== selfLocal;
      });
  const peerXmppUsername = peer?.xmppUsername || null;

  // Don't show "deleted" / "Deleted User" / "Unknown" as the dial
  // screen title when the chat title is one of the server sentinels.
  // Prefer the peer's first+last name, falling back to bare chat name.
  const rawTitle = String(room.name || '').trim();
  const isBadTitle =
    !rawTitle ||
    ['deleted', 'deleted user', 'unknown', 'null'].includes(
      rawTitle.toLowerCase()
    );
  const peerDisplay = peer
    ? `${peer.firstName || ''} ${peer.lastName || ''}`.trim() || peer.name || ''
    : '';
  const dialName =
    (isBadTitle ? peerDisplay : rawTitle) || peerDisplay || chatName;

  dispatch(
    startOutgoingCall({
      roomJid: room.jid,
      roomName: dialName,
      roomBareName: chatName,
      kind,
      peerXmppUsername,
      isGroup: isGroupRoom,
    })
  );

  // Server's broadcast call-token currently drops the `kind` attribute,
  // so signal it directly to the peer first. Direct chat is fast
  // (~50ms) and almost always lands before the server-relayed token
  // (~200-300ms), so the callee enters the right UI mode.
  if (peerXmppUsername) {
    sendCallInviteSignal(kind, {
      peerXmppUsername,
      roomBareName: chatName,
    });
  }

  try {
    await requestOutgoingCall({ chatName, kind, peerXmppUsername });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create call';
    dispatch(setCallError(message));
  }
}
