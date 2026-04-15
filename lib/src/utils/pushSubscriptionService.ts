import XmppClient from '../networking/xmppClient';
import {
  subscribeToRoomMessages,
  SubscribeResult,
} from '../networking/xmpp/subscribeToRoomMessages.xmpp';
import { getGlobalXmppClient } from './clientRegistry';

class PushSubscriptionService {
  private failedRooms: Map<string, number> = new Map();
  private retryCooldownMs = 60_000;
  private inFlightRooms: Set<string> = new Set();
  private inFlightBatch = false;

  private resolveClient(explicitClient?: XmppClient | null): XmppClient | null {
    return explicitClient || getGlobalXmppClient();
  }

  async subscribeToRoom(
    roomJID: string,
    client?: XmppClient | null
  ): Promise<SubscribeResult> {
    if (!roomJID) return { ok: false, reason: 'error', message: 'No room JID provided' };
    
    const lastFailedAt = this.failedRooms.get(roomJID);
    if (lastFailedAt && Date.now() - lastFailedAt < this.retryCooldownMs) {
      return { ok: false, reason: 'error', message: 'Retry cooldown' };
    }
    
    if (this.inFlightRooms.has(roomJID)) {
      return { ok: false, reason: 'error', message: 'Subscription in flight' };
    }

    const resolvedClient = this.resolveClient(client);
    if (!resolvedClient?.client) {
      return { ok: false, reason: 'error', message: 'XMPP client not ready' };
    }

    try {
      this.inFlightRooms.add(roomJID);
      const result: SubscribeResult = await subscribeToRoomMessages(
        resolvedClient.client,
        roomJID
      );
      
      if (result.ok) {
        this.failedRooms.delete(roomJID);
      } else {
        this.failedRooms.set(roomJID, Date.now());
      }
      
      return result;
    } catch (error) {
      this.failedRooms.set(roomJID, Date.now());
      return { ok: false, reason: 'error', message: String(error) };
    } finally {
      this.inFlightRooms.delete(roomJID);
    }
  }

}

export const pushSubscriptionService = new PushSubscriptionService();
