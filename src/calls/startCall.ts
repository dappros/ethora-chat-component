import { store } from '../roomStore';
import { setOutgoingCallRoute } from '../roomStore/callSlice';
import { createChatCall } from '../networking/api-requests/rooms.api';
import { reportCallEnded } from '../networking/api-requests/callState.api';
import { sendCallStateSignal } from '../networking/callTokenStanza';
import type { CallKindName } from './callMode';

/**
 * Second half of placing a call, shared by every dial entry point (chat
 * header, profile modal): POST /v1/chats/call/create and record how the server
 * decided to carry the call in the call slice. The caller has already
 * dispatched startOutgoingCall.
 *
 * Throws when the request fails (the entry point shows the message). A p2p
 * answer that lands after the user already cancelled is cleaned up here: the
 * server has already rung the callee, and nothing else knows its callId.
 */
export async function requestOutgoingCall(params: {
  chatName: string;
  kind: CallKindName;
  peerXmppUsername?: string | null;
}): Promise<void> {
  const startedAt = store.getState().call.startedAt;
  const result = await createChatCall(params.chatName, { kind: params.kind });

  const current = store.getState().call;
  const stillCurrent =
    current.phase !== 'idle' &&
    current.direction === 'outgoing' &&
    current.startedAt === startedAt;

  if (!stillCurrent) {
    if (result.mode === 'p2p') {
      reportCallEnded(result.callId);
      if (params.peerXmppUsername) {
        sendCallStateSignal('cancelled', {
          peerXmppUsername: params.peerXmppUsername,
          callId: result.callId,
          roomBareName: params.chatName,
        });
      }
    }
    return;
  }

  store.dispatch(
    setOutgoingCallRoute({
      startedAt,
      callId: result.callId,
      mode: result.mode,
      group: result.group,
      livekitUrl: result.livekitUrl,
      iceServers: result.iceServers,
    })
  );
}
