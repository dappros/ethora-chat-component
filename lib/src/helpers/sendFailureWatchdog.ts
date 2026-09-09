import { store } from '../roomStore';
import { setMessageSendFailed } from '../roomStore/roomsSlice';
import { hasEchoLanded, ACK_CATCHUP_DELAY_MS } from './scheduleAckCatchup';
import { ethoraLogger } from './ethoraLogger';

/**
 * How long a send may stay unacknowledged before we show the sender a
 * "not delivered" state with a retry control.
 *
 * Why 12s, and not something snappier:
 *
 *  - The only acknowledgement this protocol gives us is the MUC reflecting
 *    our own message back (`addRoomMessage` clears `pending` on it). There
 *    is no delivery receipt, so "no echo yet" is the ONLY failure signal we
 *    have, and it is a weak one - it is equally consistent with a healthy
 *    but slow send.
 *  - A healthy echo lands in ~100-300ms. xmppClient's own SLA warning fires
 *    at a p95 click-to-echo of 1500ms (`sendSlaWarningThresholdMs`), i.e.
 *    the client already considers 1.5s the outer edge of normal. 12s is 8x
 *    that outer edge.
 *  - The catch-up probe (`scheduleAckCatchup`, 2500ms) re-asserts presence
 *    and pulls MAM when the echo is missing. That probe gets a full ~9.5s
 *    to reconcile the message before this watchdog is allowed to call it
 *    failed, so the common "our presence silently dropped" case is repaired
 *    without the user ever seeing a failure.
 *  - Bursts and long messages are covered by WHERE the timer is armed, not
 *    by its length: it starts when the optimistic bubble appears and is
 *    re-armed on retry, while the send queue is serialised. A message stuck
 *    behind a burst still has its own 12s window measured from the moment
 *    the user could first see it.
 *
 * Erring long is deliberate. React Native defect #31 (26.7.1) shipped the
 * opposite trade: a trigger-happy timeout showed accepted messages as
 * failed and the resulting retries delivered them twice. A late "failed" is
 * a cosmetic annoyance; an early one produces duplicates for the recipient.
 */
export const SEND_FAILURE_TIMEOUT_MS = 12000;

/**
 * Sanity check, not a runtime knob: the watchdog must never be able to fire
 * before the catch-up probe has had a chance to repair the send.
 */
export const SEND_FAILURE_MIN_TIMEOUT_MS = ACK_CATCHUP_DELAY_MS * 2;

const watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
const retriesInFlight = new Set<string>();

/** True while a manual retry for this message id is on the wire. */
export const isSendRetryInFlight = (messageId: string): boolean =>
  retriesInFlight.has(messageId);

/**
 * Claims the retry slot for a message id. Returns false when another retry
 * for the same id already holds it, which is what makes a double-tap (or a
 * second component instance rendering the same message) send exactly once.
 */
export const beginSendRetry = (messageId: string): boolean => {
  if (!messageId || retriesInFlight.has(messageId)) return false;
  retriesInFlight.add(messageId);
  return true;
};

export const endSendRetry = (messageId: string): void => {
  retriesInFlight.delete(messageId);
};

export const clearSendFailureWatchdog = (messageId?: string): void => {
  if (!messageId) return;
  const timer = watchdogs.get(messageId);
  if (timer) {
    clearTimeout(timer);
    watchdogs.delete(messageId);
  }
};

export const clearAllSendFailureWatchdogs = (): void => {
  watchdogs.forEach((timer) => clearTimeout(timer));
  watchdogs.clear();
  retriesInFlight.clear();
};

/** Whether the store currently shows this message as failed-to-send. */
export const isMessageMarkedFailed = (
  roomJID: string,
  messageId: string
): boolean => {
  const msg = store
    .getState()
    .rooms.rooms?.[roomJID]?.messages?.find(
      (m) => m.id === messageId || m.xmppId === messageId
    );
  return Boolean(msg?.failed);
};

/**
 * Arms the "this send was never acknowledged" timer for one message.
 *
 * Re-arming for the same id replaces the previous timer rather than adding
 * a second one, so a retry cannot leave two watchdogs racing on one message.
 */
export const armSendFailureWatchdog = (params: {
  roomJID: string;
  messageId: string;
  body: string;
  timeoutMs?: number;
}): void => {
  const { roomJID, messageId, body } = params;
  if (!roomJID || !messageId) return;

  clearSendFailureWatchdog(messageId);

  const timeoutMs = Math.max(
    params.timeoutMs ?? SEND_FAILURE_TIMEOUT_MS,
    SEND_FAILURE_MIN_TIMEOUT_MS
  );

  const timer = setTimeout(() => {
    watchdogs.delete(messageId);

    // Last-moment re-check against live state, deliberately duplicated with
    // the reducer's own guard: between arming and firing, the echo (or a
    // MAM catch-up page) may have landed. A message the server accepted
    // must never be shown as failed.
    if (hasEchoLanded(roomJID, messageId)) {
      endSendRetry(messageId);
      return;
    }

    // Belt and braces for the retry slot: `resendMessage` releases it when
    // its send settles, but a send that is still stuck in the offline queue
    // never settles. Releasing here means the retry control comes back with
    // the failed state instead of staying wedged shut.
    endSendRetry(messageId);

    store.dispatch(setMessageSendFailed({ roomJID, messageId }));

    // Only notify the host if the dispatch actually changed anything - the
    // reducer no-ops for a message that is already gone or already acked.
    if (!isMessageMarkedFailed(roomJID, messageId)) return;

    ethoraLogger.log(
      `[Send] send_unacknowledged id=${messageId} room=${roomJID} after=${timeoutMs}ms`
    );

    try {
      const onMessageFailed =
        store.getState().chatSettingStore.config?.eventHandlers
          ?.onMessageFailed;
      onMessageFailed?.({
        message: body,
        roomJID,
        error: new Error(
          `Message ${messageId} was not acknowledged within ${timeoutMs}ms`
        ),
        messageType: 'text',
      });
    } catch (error) {
      console.error('Error in message failed handler:', error);
    }
  }, timeoutMs);

  watchdogs.set(messageId, timer);
};
