// Global message notification manager that can be used from both React and non-React code
import { IMessage } from '../types/models/message.model';

export interface MessageNotificationCallback {
  (message: IMessage, roomName: string, senderName: string, roomJID: string): void;
}

interface PendingNotification {
  message: IMessage;
  roomName: string;
  senderName: string;
  roomJID: string;
  ts: number;
}

class MessageNotificationManager {
  private callbacks: Set<MessageNotificationCallback> = new Set();
  private pending: PendingNotification[] = [];
  private maxPending = 50;
  private pendingTtlMs = 30_000;

  addCallback(callback: MessageNotificationCallback) {
    this.callbacks.add(callback);
    this.flushPending();
    return () => {
      this.callbacks.delete(callback);
    };
  }

  getCallbackCount() {
    return this.callbacks.size;
  }

  private flushPending() {
    if (this.callbacks.size === 0 || this.pending.length === 0) return;
    const now = Date.now();
    const valid = this.pending.filter((item) => now - item.ts <= this.pendingTtlMs);
    this.pending = [];
    valid.forEach((item) => {
      this.callbacks.forEach((cb) =>
        cb(item.message, item.roomName, item.senderName, item.roomJID)
      );
    });
  }

  showNotification(message: IMessage, roomName: string, senderName: string, roomJID: string) {
    if (this.callbacks.size > 0) {
      this.callbacks.forEach((cb) => cb(message, roomName, senderName, roomJID));
    } else {
      this.pending.push({
        message,
        roomName,
        senderName,
        roomJID,
        ts: Date.now(),
      });
      if (this.pending.length > this.maxPending) {
        this.pending = this.pending.slice(-this.maxPending);
      }
      console.warn(
        `[NotifyPolicy] source=in_app action=skip reason=no_callbacks msgId=${message?.id || ''}`
      );
    }
  }
}

export const messageNotificationManager = new MessageNotificationManager();
