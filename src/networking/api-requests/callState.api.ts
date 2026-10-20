import { store } from '../../roomStore';
import http from '../apiClient';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { IceServerConfig, normalizeIceServers } from '../../calls/callMode';

// REST side of P2P calls. A P2P call never touches LiveKit, so there is no
// LiveKit webhook to tell the server what happened: the clients report it.
// Every report is fire and forget (the UI never waits on it and a failure is
// only logged), and none of them may be sent for LiveKit calls (the server
// answers 409 CALL_NOT_P2P).

const authHeaders = () => ({
  headers: { Authorization: store.getState().chatSettingStore.user?.token || '' },
});

type CallStateReport = 'ringing' | 'decline' | 'connected' | 'end';

const postCallState = (report: CallStateReport, callId: string | null) => {
  const id = String(callId || '').trim();
  if (!id) return;
  try {
    void Promise.resolve(
      http.post(
        `/v1/chats/call/state/${report}/${encodeURIComponent(id)}`,
        undefined,
        authHeaders()
      )
    ).catch((err) =>
      ethoraLogger.log(`[call] state/${report} report failed`, err)
    );
  } catch (err) {
    ethoraLogger.log(`[call] state/${report} report failed`, err);
  }
};

/** Callee: the incoming UI is on screen. */
export const reportCallRinging = (callId: string | null) =>
  postCallState('ringing', callId);

/** Callee: the user rejected the call. The server relays it to the caller. */
export const reportCallDeclined = (callId: string | null) =>
  postCallState('decline', callId);

/** Media is flowing (ICE connected). Starts the server-side call timer. */
export const reportCallConnected = (callId: string | null) =>
  postCallState('connected', callId);

/**
 * A ringing or connected call ended for any reason. Idempotent on the server
 * (a second report returns `ended:false`), so both peers may send it.
 */
export const reportCallEnded = (callId: string | null) =>
  postCallState('end', callId);

export interface IceServersResponse {
  enabled: boolean;
  iceServers: IceServerConfig[];
  ttlSeconds: number | null;
}

/**
 * GET /v1/calls/ice-servers: fresh STUN/TURN credentials. Used by a callee
 * whose call-token carried no `ice` list, and to refresh the (ephemeral)
 * credentials before an ICE restart. Returns null on any failure so callers
 * can carry on with the servers they already have.
 */
export async function fetchIceServers(): Promise<IceServersResponse | null> {
  try {
    const response = await http.get('/v1/calls/ice-servers', authHeaders());
    const data = (response?.data || {}) as Record<string, any>;
    const iceServers = normalizeIceServers(data.iceServers);
    const ttl = Number(data.ttlSeconds);
    return {
      // Older servers omit `enabled`; a non-empty list means usable.
      enabled: typeof data.enabled === 'boolean' ? data.enabled : iceServers.length > 0,
      iceServers,
      ttlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : null,
    };
  } catch (err) {
    ethoraLogger.log('[call] ice-servers fetch failed', err);
    return null;
  }
}
