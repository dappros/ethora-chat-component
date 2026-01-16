// Global message notification manager that can be used from both React and non-React code
import { IMessage } from '../types/models/message.model';
import { store } from '../roomStore';

export interface MessageNotificationCallback {
  (message: IMessage, roomName: string, senderName: string, roomJID: string): void;
}

class MessageNotificationManager {
  private callback: MessageNotificationCallback | null = null;

  setCallback(callback: MessageNotificationCallback) {
    this.callback = callback;
  }

  removeCallback() {
    this.callback = null;
  }

  showNotification(message: IMessage, roomName: string, senderName: string, roomJID: string) {
    // Check if message is from active chat - don't show notification
    try {
      const state = store.getState();
      const activeRoomJID = state.rooms.activeRoomJID;
      if (roomJID === activeRoomJID) {
        return; // Don't show notification for active chat
      }
    } catch (error) {
      // Store might not be available, continue anyway
    }

    if (this.callback) {
      this.callback(message, roomName, senderName, roomJID);
    }
  }
}

export const messageNotificationManager = new MessageNotificationManager();
