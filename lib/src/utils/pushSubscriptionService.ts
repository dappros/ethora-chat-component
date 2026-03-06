import XmppClient from '../networking/xmppClient';
import {
  subscribeToRoomMessages,
  SubscribeResult,
} from '../networking/xmpp/subscribeToRoomMessages.xmpp';
import { getGlobalXmppClient } from './clientRegistry';

const SUBSCRIBED_ROOMS_KEY = 'ethora_subscribed_rooms';
const BLOCKED_ROOMS_KEY = 'ethora_blocked_rooms';

class PushSubscriptionService {
  private subscribedRooms: Set<string> = new Set();
  private isInitialized = false;
  private failedRooms: Map<string, number> = new Map();
  private retryCooldownMs = 60_000;
  private inFlightRooms: Set<string> = new Set();
  private inFlightBatch = false;
  private blockedRooms: Set<string> = new Set();

  private getStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  }

  private async loadSubscribedRooms(): Promise<void> {
    if (this.isInitialized) return;
    const storage = this.getStorage();
    if (!storage) {
      this.isInitialized = true;
      return;
    }

    try {
      const storedRooms = storage.getItem(SUBSCRIBED_ROOMS_KEY);
      if (storedRooms) {
        const roomsArray = JSON.parse(storedRooms) as string[];
        this.subscribedRooms = new Set(roomsArray);
      }
      const blockedRooms = storage.getItem(BLOCKED_ROOMS_KEY);
      if (blockedRooms) {
        const blockedArray = JSON.parse(blockedRooms) as string[];
        this.blockedRooms = new Set(blockedArray);
      }
    } catch (error) {
      console.error('[PushService] Failed to load subscribed rooms:', error);
    } finally {
      this.isInitialized = true;
    }
  }

  private async saveSubscribedRooms(): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;

    try {
      const roomsArray = Array.from(this.subscribedRooms);
      storage.setItem(SUBSCRIBED_ROOMS_KEY, JSON.stringify(roomsArray));
      const blockedArray = Array.from(this.blockedRooms);
      storage.setItem(BLOCKED_ROOMS_KEY, JSON.stringify(blockedArray));
    } catch (error) {
      console.error('[PushService] Failed to save subscribed rooms:', error);
    }
  }

  private resolveClient(explicitClient?: XmppClient | null): XmppClient | null {
    return explicitClient || getGlobalXmppClient();
  }

  async subscribeToRoom(
    roomJID: string,
    client?: XmppClient | null,
    force: boolean = false
  ): Promise<boolean> {
    await this.loadSubscribedRooms();

    if (!roomJID) return false;
    if (!force && this.subscribedRooms.has(roomJID)) return true;
    if (this.blockedRooms.has(roomJID)) return false;
    const lastFailedAt = this.failedRooms.get(roomJID);
    if (lastFailedAt && Date.now() - lastFailedAt < this.retryCooldownMs) {
      return false;
    }
    if (this.inFlightRooms.has(roomJID)) {
      return false;
    }

    const resolvedClient = this.resolveClient(client);
    if (!resolvedClient?.client) {
      console.warn('[PushService] XMPP client not ready, cannot subscribe to room.');
      return false;
    }

    try {
      this.inFlightRooms.add(roomJID);
      console.log('[PushService] Subscribing to room:', roomJID);
      const result: SubscribeResult = await subscribeToRoomMessages(
        resolvedClient.client,
        roomJID
      );
      if (result.ok) {
        this.subscribedRooms.add(roomJID);
        await this.saveSubscribedRooms();
        this.failedRooms.delete(roomJID);
        console.log('[PushService] Subscribed to room:', roomJID);
      } else {
        const failure = result as Exclude<SubscribeResult, { ok: true }>;
        this.failedRooms.set(roomJID, Date.now());
        if (failure.reason === 'forbidden') {
          this.blockedRooms.add(roomJID);
          await this.saveSubscribedRooms();
          console.warn(
            '[PushService] Room subscription forbidden. Blocking room:',
            roomJID,
            failure.message || ''
          );
        } else {
          console.warn(
            '[PushService] Failed to subscribe to room:',
            roomJID,
            failure.message || ''
          );
        }
      }
      return result.ok;
    } catch (error) {
      this.failedRooms.set(roomJID, Date.now());
      console.error(`[PushService] Failed to subscribe to room ${roomJID}:`, error);
      return false;
    } finally {
      this.inFlightRooms.delete(roomJID);
    }
  }

  async subscribeToRooms(
    roomJIDs: string[],
    client?: XmppClient | null,
    force: boolean = false
  ): Promise<void> {
    await this.loadSubscribedRooms();
    if (!roomJIDs?.length) return;
    if (this.inFlightBatch) return;
    this.inFlightBatch = true;
    try {
      console.log(`[NotifyPolicy] source=push_subscribe action=subscribe_batch:started rooms=${roomJIDs.length}`);
      let successful = 0;
      let failed = 0;

      for (const roomJID of roomJIDs) {
        if (!force && this.subscribedRooms.has(roomJID)) continue;
        if (this.blockedRooms.has(roomJID)) {
          continue;
        }
        try {
          const result = await this.subscribeToRoom(roomJID, client, force);
          if (result) {
            successful++;
          } else {
            failed++;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          failed++;
          console.error(`[PushService] Failed to subscribe to room ${roomJID}:`, error);
        }
      }

      console.log(`[PushService] Subscribed to ${successful} rooms, ${failed} failed`);
      console.log(`[NotifyPolicy] source=push_subscribe action=subscribe_batch:finished success=${successful} failed=${failed}`);
    } finally {
      this.inFlightBatch = false;
    }
  }

  async reset(): Promise<void> {
    this.subscribedRooms.clear();
    this.isInitialized = false;

    const storage = this.getStorage();
    if (!storage) return;

    try {
      storage.removeItem(SUBSCRIBED_ROOMS_KEY);
      console.log('[PushService] Subscribed rooms cleared from storage');
    } catch (error) {
      console.error('[PushService] Failed to clear subscribed rooms:', error);
    }
  }

  isRoomSubscribed(roomJID: string): boolean {
    return this.subscribedRooms.has(roomJID);
  }

  getSubscribedRooms(): string[] {
    return Array.from(this.subscribedRooms);
  }
}

export const pushSubscriptionService = new PushSubscriptionService();
